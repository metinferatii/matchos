// The Matchday OS agent team. Five Agent Relay participants in one Bun process:
//
//   MatchRoom actor --event--> ingest --#match--> commentator --@translator--> translator --> actor feed (en/sq/es/ar)
//                                     \--#match--> merch --> actor offer (on goals), Supabase orders
//   MatchRoom actor --question--> ingest --@stats--> stats --> actor answer (fan's language)
//
// Every relay message is mirrored into the actor's agentLog so the control room can show the agents talking.
// Every LLM call has a short timeout and a canned fallback, so the feed never stalls on stage. The commentator and
// translator budgets scale with the replay tick so the whole chain lands before the actor's fallback on the next tick.
//
//   bun agents/matchday-agents.ts [matchId]
import type { RelayAgentClient } from "@agent-relay/sdk"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import match from "../data/match.json"
import type { Lang, MatchEvent, Offer } from "../shared/contract"
import { templateLine } from "../shared/templates"
import { actors } from "./generated/index.js"
import { connectAgent, joinChannel } from "./relay"

// ---- Config ----

const envFile = join(import.meta.dir, ".env")
if (existsSync(envFile))
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }

const MATCH_ID = process.argv[2] ?? "wc22-final"
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
const EVENTS = match.events as MatchEvent[]
const RUN = Math.random().toString(36).slice(2, 7) // tags this run's relay messages; older ones are ignored
const room = actors.MatchRoom.get(MATCH_ID)
const LANG_NAME: Record<Lang, string> = { en: "English", sq: "Albanian", es: "Spanish", ar: "Arabic" }

// ---- Helpers ----

async function llm(system: string, user: string, opts: { json?: boolean; timeoutMs?: number; temperature?: number } = {}): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) return null
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2500)
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            signal: ctrl.signal,
            headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
            body: JSON.stringify({
                model: MODEL,
                temperature: opts.temperature ?? 0.7,
                max_tokens: 300,
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

async function supabase(table: string, row: Record<string, unknown>): Promise<boolean> {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return false
    try {
        const res = await fetch(`${url}/rest/v1/${table}`, {
            method: "POST",
            headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(row),
        })
        if (!res.ok) console.warn(`[supabase] ${table}: ${res.status} ${(await res.text()).slice(0, 200)}`)
        return res.ok
    } catch (err) {
        console.warn(`[supabase] ${table}: ${(err as Error).message}`)
        return false
    }
}

// Replay tick in ms, refreshed on every event; LLM budgets are a share of it (about 1.0s + 1.5s at 3s ticks).
let tickMs = 3000
const budget = (share: number) => Math.max(400, Math.round((tickMs - 250) * share))

const tag = (id: number | string) => ` [${RUN}:${id}]`
const readTag = (text: string) => text.match(new RegExp(`\\[${RUN}:([^\\]]+)\\]`))?.[1]
const untag = (text: string) => text.replace(/\s*\[[a-z0-9]+:[^\]]+\]/g, "")

/** Post on the relay and mirror the message into the actor's agentLog for the control room. */
async function say(agent: RelayAgentClient, from: string, to: string, text: string, ref?: number | string) {
    const relayed = agent.sendMessage({ to, text: ref === undefined ? text : text + tag(ref) }).catch(err => console.warn(`[relay] ${from}: ${err.message}`))
    const logged = room.postAgentMsg(from, to, untag(text)).catch(() => {})
    await Promise.all([relayed, logged])
    console.log(`${from.padEnd(11)} → ${to.padEnd(12)} ${untag(text)}`)
}

// So the commentator never guesses a brace or hat-trick: goals by this player up to and including this one.
const goalsBy = (e: MatchEvent) => EVENTS.filter(x => x.type === "goal" && x.player === e.player && x.id <= e.id).length
const ordinal = (n: number) => ["first", "second", "third", "fourth"][n - 1] ?? `${n}th`
const other = (team: string | null) => (team === match.home.name ? match.away.name : match.home.name)
const describe = (e: MatchEvent) => {
    const score = e.period === 5 && e.shootout ? `pens ${e.shootout.home}-${e.shootout.away}` : `${e.score.home}-${e.score.away}`
    // Spell out who benefits for the events where "player (team)" is the one at fault or going off.
    const who =
        e.type === "penalty_awarded" ? ` · to ${other(e.team)}, conceded by ${e.player} (${e.team})`
        : e.type === "substitution" ? ` · ${e.team}: ${e.detail}`
        : e.type === "goal" ? ` · ${e.player} (${e.team}), his ${ordinal(goalsBy(e))} goal of the match`
        : `${e.player ? ` · ${e.player}` : ""}${e.team ? ` (${e.team})` : ""}`
    return `${e.clock} ${e.type.replace(/_/g, " ").toUpperCase()}${who} · ${score}`
}

// ---- Agents ----

const [ingest, commentator, translator, stats, merch] = await Promise.all(
    ["ingest", "commentator", "translator", "stats", "merch"].map(async name => {
        const c = await connectAgent(name)
        await joinChannel(c.agent, "#match")
        return { name, ...c }
    }),
)
console.log(`Agents online for ${MATCH_ID} (run ${RUN}, model ${MODEL})`)

// commentator: one punchy English line per event, never repeating itself.
const recentLines: string[] = []
commentator.relay.addListener("message.created", async ({ message, envelope }) => {
    if (envelope.channel?.name !== "match" || envelope.from?.name !== "ingest") return
    const ref = readTag(message.text)
    if (ref === undefined || !/^\d+$/.test(ref)) return
    const e = EVENTS[Number(ref)]
    if (!e) return
    const line = (await llm(
        "You are a live football commentator for a club's fan app. Write ONE punchy English line, max 20 words, about the event given. " +
        "Use the player's name as given. Only state facts in the event; never invent details (no made-up distances, handballs, assists or minutes). " +
        "Vary your phrasing; never repeat or closely echo any of the recent lines. No hashtags, no quotes around the line." +
        (e.type === "goal" || e.type === "shootout_goal" ? " This is a big moment: bring the energy." : ""),
        `Match: Argentina vs France, 2022 World Cup final, Lusail.\nEvent: ${describe(e)}. ${e.detail}.\nRecent lines:\n${recentLines.slice(-8).join("\n") || "(none)"}`,
        { temperature: 0.9, timeoutMs: budget(0.37) },
    ))?.replace(/^"|"$/g, "") ?? templateLine(e, "en")
    recentLines.push(line)
    await say(commentator.agent, "commentator", "@translator", line, e.id)
})

// translator: listens to the commentator, outputs sq/es/ar, publishes all four languages at once.
translator.relay.addListener("dm.received", async ({ message, envelope }) => {
    if (envelope.from?.name !== "commentator") return
    const ref = readTag(message.text)
    if (ref === undefined) return
    const e = EVENTS[Number(ref)]
    const en = untag(message.text)
    const raw = await llm(
        "Translate live football commentary for fans. Return JSON {\"sq\":\"...\",\"es\":\"...\",\"ar\":\"...\"} with natural, energetic Albanian, Spanish and Arabic. " +
        "Keep player names as given (Latin script is fine in Arabic). Keep it as short as the original.",
        en,
        { json: true, timeoutMs: budget(0.55), temperature: 0.3 },
    )
    let out: Partial<Record<Lang, string>> = {}
    try { out = raw ? JSON.parse(raw) : {} } catch { /* fall back below */ }
    const lines = {
        en,
        sq: out.sq || (e ? templateLine(e, "sq") : en),
        es: out.es || (e ? templateLine(e, "es") : en),
        ar: out.ar || (e ? templateLine(e, "ar") : en),
    }
    await room.postCommentary(Number(ref), lines)
    await say(translator.agent, "translator", "#match", `🇦🇱 ${lines.sq}  ·  🇪🇸 ${lines.es}  ·  🇸🇦 ${lines.ar}`)
})

// merch: on a goal, a 10-minute flash offer on the scorer's jersey.
const JERSEY: Record<string, number> = { Messi: 10, "Di María": 11, Mbappé: 10, "Kolo Muani": 12, Dybala: 21, Paredes: 5, Montiel: 4 }
merch.relay.addListener("message.created", async ({ message, envelope }) => {
    if (envelope.channel?.name !== "match" || envelope.from?.name !== "ingest") return
    const ref = readTag(message.text)
    const e = ref !== undefined ? EVENTS[Number(ref)] : undefined
    if (!e || e.type !== "goal" || !e.player) return
    const offer: Offer = {
        id: crypto.randomUUID(),
        player: e.player,
        title: `${e.player} #${JERSEY[e.player] ?? 10} ${e.team} Home Jersey`,
        priceEur: 71.99, // what the fan pays
        originalPriceEur: 89.99,
        discountPct: 20,
        expiresAt: Date.now() + 10 * 60_000,
    }
    await room.setOffer(offer)
    await say(merch.agent, "merch", "#match", `⚡ Flash offer live: ${offer.title}, ${offer.discountPct}% off for 10 min`)
})

// stats: answers fan questions using only the actor's match state, in the fan's language.
stats.relay.addListener("dm.received", async ({ message, envelope }) => {
    if (envelope.from?.name !== "ingest") return
    const ref = readTag(message.text)
    const q = ref ? pendingQuestions.get(ref) : undefined
    if (!q) return
    pendingQuestions.delete(ref!)
    const [state, timeline] = await Promise.all([room.getState(), room.getTimeline()])
    const facts = timeline.map(describe).join("\n")
    const answer = (await llm(
        `You answer football fans' questions during a live match, using ONLY the match data given. Answer in ${LANG_NAME[q.lang]}, in 1-2 short sentences. ` +
        "If the data doesn't contain the answer, say so briefly and give the current score. Never invent stats.",
        `Current: ${state.clock}, Argentina ${state.score.home}-${state.score.away} France${state.shootout ? ` (penalties ${state.shootout.home}-${state.shootout.away})` : ""}.\nEvents so far:\n${facts || "(not started)"}\n\nQuestion: ${q.text}`,
        { timeoutMs: 4000, temperature: 0.2 },
    )) ?? `${state.clock}: Argentina ${state.score.home}-${state.score.away} France.`
    await room.postAnswer(q.userId, q.lang, answer)
    await say(stats.agent, "stats", "#match", `Answered (${q.lang}): ${answer}`)
})

// ---- ingest: the bridge from the MatchRoom actor onto the relay ----

const pendingQuestions = new Map<string, { userId: string; lang: Lang; text: string }>()

async function handleOrder(order: { id: string; userId: string; offer: Offer }) {
    const price = order.offer.priceEur
    const saved = await supabase("orders", { id: order.id, match_id: MATCH_ID, user_id: order.userId, offer: { ...order.offer, paidEur: price } })
    await room.confirmOrder(order.id, price)
    await say(merch.agent, "merch", "#match", `🛒 Sold ${order.offer.title} for €${price.toFixed(2)}${saved ? " · saved to Supabase" : ""}`)
}

async function archive() {
    const [state, timeline] = await Promise.all([room.getState(), room.getTimeline()])
    const saved = await supabase("matches", { id: MATCH_ID, timeline, feed: state.feed, archived_at: new Date().toISOString() })
    await say(ingest.agent, "ingest", "#match", saved ? "🏁 Full time. Match archived to Supabase." : "🏁 Full time. (Supabase not configured, archive skipped.)")
}

async function onActorMessage(msg: any) {
    if (msg.type === "event") {
        const e = msg.event as MatchEvent
        room.getState().then(s => { tickMs = s.tickMs }).catch(() => {})
        await say(ingest.agent, "ingest", "#match", describe(e), e.id)
        // Give the final commentary a moment to land so the archive includes it.
        if (e.type === "full_time") setTimeout(() => archive().catch(err => console.warn("[archive]", err.message)), 4000)
    } else if (msg.type === "question") {
        const q = msg.question
        const ref = q.id.slice(0, 8)
        pendingQuestions.set(ref, q)
        await say(ingest.agent, "ingest", "@stats", `Fan question (${q.lang}): "${q.text}"`, ref)
    } else if (msg.type === "order") {
        await handleOrder(msg.order)
    }
}

// Keep a socket to the actor open; reconnect if the actor server restarts.
async function connectActor() {
    try {
        const { websocketUrl } = await actors.MatchRoom.prepareWebsocket({ actorId: MATCH_ID, metadata: { userId: "__agents__", lang: "en" } })
        const ws = new WebSocket(websocketUrl)
        ws.addEventListener("open", () => console.log("[actor] connected"))
        ws.addEventListener("message", e => {
            let msg: any
            try { msg = JSON.parse(String(e.data)) } catch { return }
            onActorMessage(msg).catch(err => console.warn("[ingest]", err.message))
        })
        ws.addEventListener("close", () => {
            console.log("[actor] disconnected, retrying")
            setTimeout(connectActor, 1000)
        })
    } catch {
        setTimeout(connectActor, 1000)
    }
}
await connectActor()
