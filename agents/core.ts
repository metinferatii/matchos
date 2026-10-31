// Shared runtime for the Matchday OS newsroom: config, feature flags, LLM and Supabase helpers,
// match facts, and the Member wrapper every agent uses to talk on the #match channel.
//
// All agent traffic goes to #match with metadata { run, to, kind, ref, data }. Relay metadata
// survives channel posts (not DMs), so addressing lives in `to` and every member filters for itself.
import type { RelayAgentClient } from "@agent-relay/sdk"
import type { AgentRelay } from "@agent-relay/sdk"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import match from "../data/match.json"
import type { AgentKind, MatchEvent } from "../shared/contract"
import { actors } from "./generated/index.js"
import { connectAgent, joinChannel } from "./relay"

const envFile = join(import.meta.dir, ".env")
if (existsSync(envFile))
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }

// Each newsroom upgrade can be switched off instantly with e.g. PRODUCER=0; everything falls back
// to the original pipeline behaviour.
const flag = (name: string) => !["0", "false", "off", "no"].includes((process.env[name] ?? "1").toLowerCase())
export const flags = {
    producer: flag("PRODUCER"),
    hiring: flag("HIRING"),
    negotiation: flag("NEGOTIATION"),
    initiative: flag("INITIATIVE"),
    fanAgents: flag("FAN_AGENTS"),
}

export const MATCH_ID = process.argv[2] ?? "wc22-final"
export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
// Quick decisions (directive tone, draft review, negotiation phrasing) use the faster model with tiny outputs.
export const FAST_MODEL = process.env.OPENAI_FAST_MODEL ?? "gpt-4o-mini"
export const EVENTS = match.events as MatchEvent[]
export const HOME = match.home.name
export const AWAY = match.away.name
export const RUN = Math.random().toString(36).slice(2, 7) // tags this run's relay messages; older ones are ignored
export const room = actors.MatchRoom.get(MATCH_ID)

// Any agent step that could delay commentary waits at most this long, then falls back.
export const STEP_MS = Number(process.env.STEP_MS ?? 800)

// Replay tick in ms, refreshed on every event; LLM budgets are a share of it.
export const tick = { ms: 4000 }
export const budget = (share: number) => Math.max(400, Math.round((tick.ms - 250) * share))

type LlmOpts = { json?: boolean; timeoutMs?: number; temperature?: number; model?: string; maxTokens?: number }
export async function llm(system: string, user: string, opts: LlmOpts = {}): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) return null
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2500)
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            signal: ctrl.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
                model: opts.model ?? MODEL,
                temperature: opts.temperature ?? 0.7,
                max_tokens: opts.maxTokens ?? 300,
                messages: [{ role: "system", content: system }, { role: "user", content: user }],
                ...(opts.json ? { response_format: { type: "json_object" } } : {}),
            }),
        })
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
        const data = (await res.json()) as any
        return data.choices?.[0]?.message?.content?.trim() ?? null
    } catch (err) {
        console.warn(`[llm] ${(err as Error).name === "AbortError" ? "timeout" : (err as Error).message.slice(0, 120)}`)
        return null
    } finally {
        clearTimeout(timer)
    }
}

/** LLM call that must return a JSON object; null on timeout or bad JSON. */
export async function llmJson<T>(system: string, user: string, timeoutMs: number, opts: Omit<LlmOpts, "json" | "timeoutMs"> = {}): Promise<T | null> {
    const raw = await llm(system, user, { temperature: 0.3, ...opts, json: true, timeoutMs })
    try { return raw ? (JSON.parse(raw) as T) : null } catch { return null }
}

// ---- Supabase (REST, secret key; RLS stays on for everyone else) ----

const sbUrl = () => process.env.SUPABASE_URL
const sbKey = () => process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

async function sb(method: string, path: string, body?: unknown, prefer = "return=minimal"): Promise<Response | null> {
    const url = sbUrl(), key = sbKey()
    if (!url || !key) return null
    try {
        const res = await fetch(`${url}/rest/v1/${path}`, {
            method,
            headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (!res.ok) console.warn(`[supabase] ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`)
        return res
    } catch (err) {
        console.warn(`[supabase] ${method} ${path}: ${(err as Error).message}`)
        return null
    }
}

export const supabase = {
    async upsert(table: string, row: unknown): Promise<boolean> {
        return (await sb("POST", table, row, "resolution=merge-duplicates,return=minimal"))?.ok ?? false
    },
    async select<T>(table: string, query = "select=*"): Promise<T[] | null> {
        const res = await sb("GET", `${table}?${query}`, undefined, "")
        return res?.ok ? ((await res.json()) as T[]) : null
    },
    async patch(table: string, query: string, values: unknown): Promise<boolean> {
        return (await sb("PATCH", `${table}?${query}`, values))?.ok ?? false
    },
}

// ---- Match facts (the only facts agents may state) ----

export const isGoal = (e: MatchEvent) => e.type === "goal"
// So the commentator never guesses a brace or hat-trick: goals by this player up to and including this one.
export const goalsBy = (e: MatchEvent) => EVENTS.filter(x => x.type === "goal" && x.player === e.player && x.id <= e.id).length
export const ordinal = (n: number) => ["first", "second", "third", "fourth"][n - 1] ?? `${n}th`
export const other = (team: string | null) => (team === HOME ? AWAY : HOME)
export const PERIOD = ["", "first half", "second half", "extra time, first half", "extra time, second half", "penalty shootout"]

export function describe(e: MatchEvent): string {
    const score = e.period === 5 && e.shootout ? `pens ${e.shootout.home}-${e.shootout.away}` : `${e.score.home}-${e.score.away}`
    // Spell out who benefits for the events where "player (team)" is the one at fault or going off.
    const who =
        e.type === "penalty_awarded" ? ` · to ${other(e.team)}, conceded by ${e.player} (${e.team})`
        : e.type === "substitution" ? ` · ${e.team}: ${e.detail}`
        : e.type === "goal" ? ` · ${e.player} (${e.team}), his ${ordinal(goalsBy(e))} goal of the match`
        : `${e.player ? ` · ${e.player}` : ""}${e.team ? ` (${e.team})` : ""}`
    return `${e.clock} ${e.type.replace(/_/g, " ").toUpperCase()}${who} · ${score}`
}

// ---- Newsroom members ----

export type Msg = { from: string; to: string; kind?: AgentKind; ref?: string; data?: any; text: string }
type Handler = (msg: Msg) => void | Promise<void>

export class Member {
    private handlers: Handler[] = []
    private waiters = new Set<{ match: (m: Msg) => boolean; resolve: (m: Msg) => void }>()

    private constructor(readonly name: string, readonly relay: AgentRelay, readonly agent: RelayAgentClient) {
        relay.addListener("message.created", ({ message, envelope }: any) => {
            const meta = message.metadata
            if (envelope.channel?.name !== "match" || meta?.run !== RUN) return
            const from = envelope.from?.name
            if (!from || from === name) return
            const msg: Msg = { from, to: meta.to ?? "all", kind: meta.kind, ref: meta.ref, data: meta.data, text: message.text ?? "" }
            for (const w of this.waiters) if (w.match(msg)) { this.waiters.delete(w); w.resolve(msg) }
            for (const h of this.handlers) Promise.resolve(h(msg)).catch(err => console.warn(`[${name}]`, err.message))
        })
    }

    static async join(name: string): Promise<Member> {
        const { relay, agent } = await connectAgent(name)
        await joinChannel(agent, "#match")
        return new Member(name, relay, agent)
    }

    /** Messages addressed to this member (or to everyone, or to a group it belongs to). */
    on(handler: Handler, groups: string[] = []) {
        const mine = new Set([this.name, "all", ...groups])
        this.handlers.push(m => (mine.has(m.to) ? handler(m) : undefined))
    }

    /** Every message on the channel, whoever it is addressed to (for observers like the producer). */
    onAny(handler: Handler) {
        this.handlers.push(handler)
    }

    /** Resolves with the first matching message, or null after timeoutMs. */
    waitFor(match: (m: Msg) => boolean, timeoutMs: number): Promise<Msg | null> {
        return new Promise(resolve => {
            const w = { match, resolve: (m: Msg) => { clearTimeout(t); resolve(m) } }
            const t = setTimeout(() => { this.waiters.delete(w); resolve(null) }, timeoutMs)
            this.waiters.add(w)
        })
    }

    /** Runs a piece of work with this member shown as "working" on the control-room roster. */
    async task<T>(fn: () => Promise<T>): Promise<T> {
        this.busy++
        if (this.busy === 1) room.setAgentStatus(this.name, "working").catch(() => {})
        try {
            return await fn()
        } finally {
            this.busy--
            if (this.busy === 0) room.setAgentStatus(this.name, "idle").catch(() => {})
        }
    }
    private busy = 0

    /** Posts on #match and mirrors the line into the actor's agentLog for the control room. */
    async post(to: string, text: string, opts: { kind?: AgentKind; ref?: string | number; data?: unknown } = {}) {
        const ref = opts.ref === undefined ? undefined : String(opts.ref)
        const metadata = { run: RUN, to, ...(opts.kind ? { kind: opts.kind } : {}), ...(ref ? { ref } : {}), ...(opts.data === undefined ? {} : { data: opts.data }) }
        const relayed = this.agent.sendMessage({ to: "#match", text, metadata }).catch(err => console.warn(`[relay] ${this.name}: ${err.message}`))
        const logged = room.postAgentMsg(this.name, to, text, opts.kind).catch(() => {})
        await Promise.all([relayed, logged])
        console.log(`${this.name.padEnd(13)} → ${to.padEnd(13)} ${opts.kind ? `[${opts.kind}] ` : ""}${text}`)
    }
}
