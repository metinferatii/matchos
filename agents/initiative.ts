// Initiative: agents acting without being asked.
// - stats: in a quiet spell (no key event for QUIET_TICKS events) it posts one nugget. The fact is
//   computed from the events here; the model only phrases it, per language.
// - crowd: every CROWD_MS it reads votes and questions per language and sends the producer a mood note.
// - producer: may answer a mood note by asking stats for a short explainer in that language (at most
//   one such action per minute).
import type { MatchEvent } from "../shared/contract"
import { EVENTS, FAST_MODEL, HOME, AWAY, llm, llmJson, room, type Member } from "./core"
import { LANG_NAME } from "./hiring"

const QUIET_TICKS = Number(process.env.QUIET_TICKS ?? 4)
const CROWD_MS = Number(process.env.CROWD_MS ?? 30_000)
const ACTION_GAP_MS = 60_000
const KEY = new Set(["goal", "penalty_awarded", "red_card", "shootout_start", "shootout_goal", "shootout_miss", "full_time"])

/** True facts about the match so far, as plain English sentences. */
export function factsUpTo(e: MatchEvent): { key: string; text: string }[] {
    const seen = EVENTS.slice(0, e.id + 1).filter(x => x.period < 5)
    const facts: { key: string; text: string }[] = []
    const goals = new Map<string, number>()
    for (const x of seen) if (x.type === "goal" && x.player) goals.set(x.player, (goals.get(x.player) ?? 0) + 1)
    for (const [p, n] of goals) {
        if (n === 2) facts.push({ key: `brace-${p}`, text: `${p} has two goals in this final. One more is a hat-trick.` })
        else if (n >= 3) facts.push({ key: `hattrick-${p}`, text: `${p} has a hat-trick in this final.` })
    }
    const onTarget = (team: string) => seen.filter(x => x.team === team && (x.type === "shot_saved" || x.type === "goal")).length
    facts.push({ key: `shots-${onTarget(HOME)}-${onTarget(AWAY)}`, text: `Shots on target so far: ${HOME} ${onTarget(HOME)}, ${AWAY} ${onTarget(AWAY)}.` })
    const cards = (team: string) => seen.filter(x => x.team === team && x.type === "yellow_card").length
    if (cards(HOME) + cards(AWAY) > 0)
        facts.push({ key: `cards-${cards(HOME)}-${cards(AWAY)}`, text: `Yellow cards so far: ${HOME} ${cards(HOME)}, ${AWAY} ${cards(AWAY)}.` })
    const scorers = [...goals].map(([p, n]) => `${p} ${n}`).join(", ")
    if (scorers) facts.push({ key: `scorers-${scorers}`, text: `Goals so far: ${scorers}.` })
    return facts
}

export function startInitiative(m: { stats: Member; producer?: Member; crowd: Member }) {
    const { stats, producer, crowd } = m
    let quiet = 0
    let lastNuggetEvent = -99
    let lastKind = ""
    const used = new Set<string>()

    // stats: a nugget when nothing big has happened for a while.
    stats.on(async msg => {
        if (msg.from !== "ingest" || msg.data?.eventId === undefined) return
        const e = EVENTS[msg.data.eventId]
        if (!e) return
        quiet = KEY.has(e.type) ? 0 : quiet + 1
        if (quiet < QUIET_TICKS || e.id - lastNuggetEvent < QUIET_TICKS || e.period === 5) return
        // Prefer a different kind of fact from last time (brace, shots, cards, scorers).
        const fresh = factsUpTo(e).filter(f => !used.has(f.key))
        const fact = fresh.find(f => f.key.split("-")[0] !== lastKind) ?? fresh[0]
        if (!fact) return
        used.add(fact.key)
        lastKind = fact.key.split("-")[0]
        lastNuggetEvent = e.id
        const langs = (await room.getState()).languages
        const lines = await stats.task(() => llmJson<Record<string, string>>(
            `Rewrite this football fact as one short, lively line for a live fan feed, in each language requested. ` +
            `Do not add any fact, number or claim that is not in the input. Return JSON with these keys: ${langs.join(", ")} ` +
            `(${langs.map(l => LANG_NAME[l]).join(", ")}).`,
            fact.text,
            3000,
            { temperature: 0.5 },
        ))
        if (!lines?.en) return
        await stats.post("producer", `Quiet spell at ${e.clock}, posting a nugget: ${lines.en}`, { kind: "initiative", ref: e.id, data: { fact: fact.text } })
        await room.postNugget(lines)
    })

    // crowd: a mood note for the producer, read from votes and questions per language.
    setInterval(async () => {
        try {
            const byLang = await room.getCrowd(CROWD_MS * 2)
            const active = Object.entries(byLang).filter(([, c]) => c.questions.length || Object.keys(c.votes).length)
            if (!active.length) return
            const topics: Record<string, string> = {}
            for (const [lang, c] of active) {
                if (!c.questions.length) continue
                const t = await crowd.task(() => llm(
                    "In 1-3 words (English), what football topic are these fan questions mostly about? Reply with the topic only.",
                    c.questions.join("\n"),
                    { model: FAST_MODEL, maxTokens: 12, timeoutMs: 2000, temperature: 0 },
                ))
                topics[lang] = (t ?? c.questions[0]).replace(/[."]/g, "").slice(0, 40)
            }
            const parts = active.map(([lang, c]) => {
                const top = Object.entries(c.votes).sort((a, b) => b[1] - a[1])[0]
                const asks = c.questions.length ? `${c.questions.length} question${c.questions.length > 1 ? "s" : ""} about ${topics[lang]}` : "no questions"
                return `${LANG_NAME[lang] ?? lang} fans: ${asks}${top ? `, top pick ${top[0]}` : ""}`
            })
            await crowd.post("producer", parts.join(". ") + ".", { kind: "note", data: { byLang, topics } })
        } catch (err) {
            console.warn("[crowd]", (err as Error).message)
        }
    }, CROWD_MS)

    // producer: turns a mood note into one action, at most once a minute.
    let lastAction = 0
    producer?.on(async msg => {
        if (msg.from !== "crowd" || !msg.data?.topics) return
        if (Date.now() - lastAction < ACTION_GAP_MS) return
        const [lang, topic] = Object.entries(msg.data.topics as Record<string, string>)
            .sort((a, b) => (msg.data.byLang[b[0]]?.questions.length ?? 0) - (msg.data.byLang[a[0]]?.questions.length ?? 0))[0] ?? []
        if (!lang || !topic) return
        lastAction = Date.now()
        await producer.post("stats", `${LANG_NAME[lang] ?? lang} fans keep asking about ${topic}. Post a short explainer for them.`, { kind: "directive", data: { explain: { lang, topic } } })
    })

    // stats: the explainer the producer asked for, grounded in the match so far.
    stats.on(async msg => {
        if (msg.from !== "producer" || !msg.data?.explain) return
        const { lang, topic } = msg.data.explain as { lang: string; topic: string }
        const state = await room.getState()
        const facts = factsUpTo(EVENTS[Math.max(0, state.cursor - 1)]).map(f => f.text).join(" ")
        const text = await stats.task(() => llm(
            `Write a short explainer (max 2 sentences) for football fans in ${LANG_NAME[lang] ?? "English"} about: ${topic}. ` +
            "You may explain the rules of football. For anything about this match, use only the facts given; never invent stats or history.",
            `Now: ${state.clock}, ${HOME} ${state.score.home}-${state.score.away} ${AWAY}. Facts: ${facts}`,
            { timeoutMs: 4000, temperature: 0.3 },
        ))
        if (!text) return
        await room.postLangAnswer(lang as any, text)
        await stats.post("all", `Posted an explainer for ${LANG_NAME[lang] ?? lang} fans: ${text}`, { kind: "initiative" })
    })
}
