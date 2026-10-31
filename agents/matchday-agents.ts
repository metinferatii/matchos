// The Matchday OS newsroom: Agent Relay participants in one Bun process, all talking on #match.
//
//   MatchRoom actor --event--> ingest --> producer (directive) --> commentator (draft) <--> producer (review)
//                                                                  commentator (final) --> translators --> actor feed
//                                     --> merch (offer on goals)          stats (prep notes, fan answers)
//
// Each upgrade sits behind a flag (PRODUCER, HIRING, NEGOTIATION, INITIATIVE; set to 0 to switch off).
// Every agent step that could delay commentary has a short timeout and falls back to the original
// pipeline behaviour, and every LLM call has a canned fallback, so the feed never stalls on stage.
//
//   bun agents/matchday-agents.ts [matchId]
import type { Lang, MatchEvent, Offer } from "../shared/contract"
import { templateLine } from "../shared/templates"
import { EVENTS, MATCH_ID, MODEL, Member, RUN, STEP_MS, budget, describe, flags, goalsBy, isGoal, llm, room, supabase, tick } from "./core"
import { actors } from "./generated/index.js"
import { LANG_NAME, releaseHires, restoreHires, startHiring } from "./hiring"
import { ruleDirective, startProducer, type Directive } from "./producer"

const names = ["ingest", "commentator", "translator", "stats", "merch", ...(flags.producer ? ["producer"] : [])]
const members = Object.fromEntries(await Promise.all(names.map(async n => [n, await Member.join(n)] as const)))
const { ingest, commentator, translator, stats, merch } = members
console.log(`Newsroom online for ${MATCH_ID} (run ${RUN}, model ${MODEL}) flags ${JSON.stringify(flags)}`)

const ROLES: Record<string, string> = {
    ingest: "match data", producer: "editor", commentator: "commentary", translator: "translator (sq, es, ar)",
    stats: "facts and answers", merch: "flash offers",
}
await room.registerAgents(names.map(n => ({ name: n, role: ROLES[n] ?? n })))

const publishedLines: string[] = []
if (flags.producer) startProducer(members.producer, publishedLines)
// Hiring is the producer's decision, so it needs both flags; without it, those fans get English.
const hiring = flags.producer && flags.hiring
if (hiring) {
    startHiring(members.producer)
    await restoreHires()
}

/** The producer's directive for an event, or the rule-based default if it doesn't arrive in time. */
async function directiveFor(m: Member, e: MatchEvent): Promise<Directive> {
    if (!flags.producer || isGoal(e)) return ruleDirective(e) // goals never wait
    const d = await m.waitFor(x => x.from === "producer" && x.kind === "directive" && x.ref === String(e.id), STEP_MS)
    return (d?.data as Directive) ?? ruleDirective(e)
}

// ---- commentator: one line per event, shaped by the producer's directive and review ----

const COMMENTATOR =
    "You are a live football commentator for a club's fan app. Write ONE English line, max 20 words, about the event given. " +
    "Use the player's name as given. Only state facts in the event; never invent details (no made-up distances, handballs, assists or minutes). " +
    "Vary your phrasing; never repeat or closely echo any of the recent lines. No hashtags, no quotes around the line."

commentator.on(async m => {
    if (m.from !== "ingest" || m.data?.eventId === undefined) return
    const e = EVENTS[m.data.eventId]
    if (!e) return
    // Everything must be published before the actor's next tick (its fallback); the final line must
    // reach the translators by `deadline`, leaving them ~1.2s.
    const publishBy = Date.now() + tick.ms - 250
    const deadline = publishBy - 1250
    await commentator.task(async () => {
    const d = await directiveFor(commentator, e)
    const context = `Match: Argentina vs France, 2022 World Cup final, Lusail.\nEvent: ${describe(e)}. ${e.detail}.\nTone: ${d.tone}.\nRecent lines:\n${publishedLines.slice(-8).join("\n") || "(none)"}`
    let line = (await llm(COMMENTATOR, context, { temperature: 0.9, timeoutMs: Math.min(budget(0.3), Math.max(400, deadline - Date.now() - 200)) }))?.replace(/^"|"$/g, "")
        ?? templateLine(e, "en")

    // One review round for normal/high moments, only if there is still time for a rewrite after it.
    const left = deadline - Date.now()
    if (flags.producer && (d.importance === "normal" || d.importance === "high") && left > 1100) {
        const reviewMs = Math.min(STEP_MS, left - 500)
        const verdict = commentator.waitFor(x => x.from === "producer" && x.ref === String(e.id) && (x.kind === "rejection" || x.kind === "agreement"), reviewMs)
        await commentator.post("producer", line, { kind: "draft", ref: e.id, data: { eventId: e.id, line, tone: d.tone, timeoutMs: reviewMs - 80 } })
        const v = await verdict
        if (v?.kind === "rejection") {
            const rewrite = await llm(COMMENTATOR, `${context}\nYour draft: ${line}\nThe producer rejected it: ${v.data?.reason}. Rewrite it.`, {
                temperature: 0.8, timeoutMs: Math.max(400, Math.min(1000, deadline - Date.now() - 100)),
            })
            if (rewrite) line = rewrite.replace(/^"|"$/g, "")
        }
    }
    publishedLines.push(line)
    await commentator.post("translators", line, { ref: e.id, data: { eventId: e.id, line, publishBy } })
    })
})

// ---- translator: sq/es/ar, published together with the English line ----

translator.on(async m => {
    if (m.from !== "commentator" || m.data?.line === undefined) return
    const e = EVENTS[m.data.eventId]
    const en: string = m.data.line
    const raw = await translator.task(() => llm(
        "Translate live football commentary for fans. Return JSON {\"sq\":\"...\",\"es\":\"...\",\"ar\":\"...\"} with natural, energetic Albanian, Spanish and Arabic. " +
        "Keep player names as given (Latin script is fine in Arabic). Keep it as short as the original.",
        en,
        { json: true, timeoutMs: Math.max(400, (m.data.publishBy ?? Date.now() + budget(0.4)) - Date.now() - 60), temperature: 0.3 },
    ))
    let out: Partial<Record<Lang, string>> = {}
    try { out = raw ? JSON.parse(raw) : {} } catch { /* fall back below */ }
    const lines = {
        en,
        sq: out.sq || (e ? templateLine(e, "sq") : en),
        es: out.es || (e ? templateLine(e, "es") : en),
        ar: out.ar || (e ? templateLine(e, "ar") : en),
    }
    await room.postCommentary(m.data.eventId, lines)
    await translator.post("all", `sq: ${lines.sq} · es: ${lines.es} · ar: ${lines.ar}`)
}, ["translators"])

// ---- merch: a 10-minute flash offer on the scorer's jersey (NEGOTIATION upgrades this) ----

export const JERSEY: Record<string, number> = { Messi: 10, "Di María": 11, Mbappé: 10, "Kolo Muani": 12, Dybala: 21, Paredes: 5, Montiel: 4 }
export const defaultOffer = (e: MatchEvent): Offer => ({
    id: crypto.randomUUID(),
    player: e.player!,
    title: `${e.player} #${JERSEY[e.player!] ?? 10} ${e.team} home jersey`,
    priceEur: 71.99, // what the fan pays
    originalPriceEur: 89.99,
    discountPct: 20,
    expiresAt: Date.now() + 10 * 60_000,
})

merch.on(async m => {
    if (m.from !== "ingest" || m.data?.eventId === undefined) return
    const e = EVENTS[m.data.eventId]
    if (!e || !isGoal(e) || !e.player) return
    if (!(await directiveFor(merch, e)).act.includes("merch")) return
    const offer = defaultOffer(e)
    await room.setOffer(offer)
    await merch.post("all", `Flash offer: ${offer.title}, ${offer.discountPct}% off for 10 min`)
})

merch.on(async m => {
    if (m.from !== "ingest" || !m.data?.order) return
    const order = m.data.order as { id: string; userId: string; offer: Offer }
    const price = order.offer.priceEur
    const saved = await supabase.upsert("orders", { id: order.id, match_id: MATCH_ID, user_id: order.userId, offer: { ...order.offer, paidEur: price } })
    await room.confirmOrder(order.id, price)
    await merch.post("all", `Sold ${order.offer.title} for €${price.toFixed(2)}${saved ? " · saved to Supabase" : ""}`)
})

// ---- stats: prep notes on big moments, and answers to fan questions ----

/** Goals per player so far, computed from the events (never from the model). */
function goalTally(upTo: number): Map<string, number> {
    const t = new Map<string, number>()
    for (const x of EVENTS.slice(0, upTo + 1)) if (x.type === "goal" && x.player) t.set(x.player, (t.get(x.player) ?? 0) + 1)
    return t
}

if (flags.producer)
    // Directives are addressed to the commentator; stats listens in for the ones that name it.
    stats.onAny(async m => {
        if (m.from !== "producer" || m.kind !== "directive" || !m.data?.act?.includes("stats")) return
        const e = EVENTS[Number(m.ref)]
        if (!e) return
        const tally = [...goalTally(e.id)].map(([p, n]) => `${p} ${n}`).join(", ")
        const note = isGoal(e) ? `${e.player} has ${goalsBy(e)} this match. Goals so far: ${tally}.` : `Score ${e.score.home}-${e.score.away}. Goals so far: ${tally || "none"}.`
        await stats.post("producer", `Prep ${e.clock}: ${note}`, { kind: "note", ref: e.id })
    })

stats.on(async m => {
    if (m.from !== "ingest" || !m.data?.question) return
    const q = m.data.question as { userId: string; lang: string; text: string }
    const [state, timeline] = await Promise.all([room.getState(), room.getTimeline()])
    const facts = timeline.map(describe).join("\n")
    const answer = (await stats.task(() => llm(
        `You answer football fans' questions during a live match, using ONLY the match data given. Answer in ${LANG_NAME[q.lang] ?? "English"}, in 1-2 short sentences. ` +
        "If the data doesn't contain the answer, say so briefly and give the current score. Never invent stats.",
        `Current: ${state.clock}, Argentina ${state.score.home}-${state.score.away} France${state.shootout ? ` (penalties ${state.shootout.home}-${state.shootout.away})` : ""}.\nEvents so far:\n${facts || "(not started)"}\n\nQuestion: ${q.text}`,
        { timeoutMs: 4000, temperature: 0.2 },
    ))) ?? `${state.clock}: Argentina ${state.score.home}-${state.score.away} France.`
    await room.postAnswer(q.userId, q.lang as Lang, answer)
    await stats.post("all", `Answered (${q.lang}): ${answer}`)
})

// ---- ingest: the bridge from the MatchRoom actor onto the relay ----

async function archive() {
    const [state, timeline] = await Promise.all([room.getState(), room.getTimeline()])
    const saved = await supabase.upsert("matches", { id: MATCH_ID, timeline, feed: state.feed, archived_at: new Date().toISOString() })
    await ingest.post("all", saved ? "Full time. Match archived to Supabase." : "Full time. Supabase not configured, archive skipped.")
}

async function onActorMessage(msg: any) {
    if (msg.type === "event") {
        const e = msg.event as MatchEvent
        room.getState().then(s => { tick.ms = s.tickMs }).catch(() => {})
        await ingest.post("all", describe(e), { ref: e.id, data: { eventId: e.id } })
        // Give the final commentary a moment to land so the archive includes it.
        if (e.type === "full_time") setTimeout(() => archive().catch(err => console.warn("[archive]", err.message)), 4000)
    } else if (msg.type === "question") {
        const q = msg.question
        await ingest.post("stats", `Fan question (${q.lang}): "${q.text}"`, { ref: q.id.slice(0, 8), data: { question: q } })
    } else if (msg.type === "language_needed" && hiring) {
        const { lang, fans } = msg
        await ingest.post("producer", `A fan joined in ${LANG_NAME[lang] ?? lang}. No translator covers ${lang}.`, { kind: "note", data: { languageNeeded: { lang, fans } } })
    } else if (msg.type === "reset") {
        releaseHires()
    } else if (msg.type === "order") {
        await ingest.post("merch", `Order from ${msg.order.userId}: ${msg.order.offer.title}`, { data: { order: msg.order } })
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
