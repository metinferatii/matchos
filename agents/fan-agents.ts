// Personal fan agents: every connected fan gets their own agent, a relay participant ("fan-sq-3f2a")
// whose memory lives in that fan's FanAgent actor (picks, questions, purchases, where they left off).
// It welcomes them, writes them a personal line at every goal, negotiates a personal offer with
// club-ops when their pick scores, and catches them up on what they missed when they come back.
// Everything it says comes from the match events and the fan's own memory.
import type { FanLang, FanMemory, MatchEvent, Offer } from "../shared/contract"
import { EVENTS, FAST_MODEL, HOME, AWAY, Member, goalsBy, llm, ordinal, room } from "./core"
import { actors } from "./generated/index.js"
import { LANG_NAME } from "./hiring"
import { negotiateOffer } from "./negotiation"

type Fan = { userId: string; lang: FanLang; name: string; member: Member; active: boolean; memory: FanMemory; since: number; busy: number }
const fans = new Map<string, Fan>()
const joining = new Map<string, Promise<Fan | null>>()

const fanActor = (userId: string) => actors.FanAgent.get(userId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128))
const shortId = (s: string) => {
    let h = 2166136261
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    return (h >>> 0).toString(16).slice(0, 4)
}
const KEY = new Set(["goal", "penalty_awarded", "red_card", "shootout_goal", "shootout_miss", "full_time"])

async function publish(fan: Fan) {
    await room.upsertFanAgent({
        userId: fan.userId, name: fan.name, lang: fan.lang, favourite: fan.memory.favourite,
        status: fan.busy > 0 ? "working" : "idle", since: fan.since,
    }).catch(() => {})
}

/** Runs work with this fan's agent shown as working in the control room. */
async function task<T>(fan: Fan, fn: () => Promise<T>): Promise<T> {
    if (++fan.busy === 1) await publish(fan)
    try { return await fn() } finally { if (--fan.busy === 0) await publish(fan) }
}

async function say(fan: Fan, text: string, logLine: string, kind: "note" | "initiative" = "initiative") {
    const clock = (await room.getState()).clock
    await Promise.all([
        room.postPersonal(fan.userId, fan.lang, text, fan.name),
        fanActor(fan.userId).recordNote(clock, text),
        fan.member.post(fan.userId, logLine, { kind }),
    ])
}

/** One short line in the fan's language, from facts only; null if the model is slow. */
const phrase = (fan: Fan, instruction: string, facts: string, timeoutMs = 2500) =>
    llm(
        `You are this football fan's own matchday agent, speaking directly to them ("you"). ${instruction} ` +
        `Write in ${LANG_NAME[fan.lang] ?? "English"}. Use only the facts given; never invent anything. No emoji, no hashtags.`,
        facts,
        { model: FAST_MODEL, maxTokens: 90, timeoutMs, temperature: 0.6 },
    ).then(t => t?.replace(/^"|"$/g, "").trim() || null)

const WELCOME: Record<string, string> = {
    en: "I'm your matchday agent. Pick who scores next and I'll follow your call all match.",
    sq: "Jam agjenti yt i ndeshjes. Zgjidh kush shënon më pas dhe do ta ndjek parashikimin tënd gjatë gjithë ndeshjes.",
    es: "Soy tu agente del partido. Elige quién marca el próximo y seguiré tu pronóstico todo el partido.",
    ar: "أنا وكيلك الخاص بالمباراة. اختر من سيسجل الهدف القادم وسأتابع توقعك طوال المباراة.",
    ja: "あなた専属のマッチデー・エージェントです。次に得点する選手を選んでください。試合中ずっと予想を追いかけます。",
    fr: "Je suis votre agent pour ce match. Choisissez qui marque le prochain but et je suivrai votre pronostic.",
    de: "Ich bin dein persönlicher Matchday-Agent. Tipp, wer als Nächstes trifft, und ich verfolge deinen Tipp das ganze Spiel.",
    tr: "Ben senin maç ajanınım. Sıradaki golü kimin atacağını seç, tahminini maç boyunca takip edeyim.",
}

// ---- Lifecycle ----

export function onFanJoined(userId: string, lang: FanLang, cursor: number, opts: { restored?: boolean } = {}) {
    const pending = joining.get(userId)
    if (pending) return pending
    const p = join(userId, lang, cursor, opts).finally(() => joining.delete(userId))
    joining.set(userId, p)
    return p
}

async function join(userId: string, lang: FanLang, cursor: number, opts: { restored?: boolean }): Promise<Fan | null> {
    const { memory, isNew } = await fanActor(userId).load(userId, lang)
    let fan = fans.get(userId)
    const wasActive = fan?.active ?? !!opts.restored
    if (!fan) {
        const name = `fan-${lang}-${shortId(userId)}`
        const member = await Member.join(name)
        fan = { userId, lang, name, member, active: true, memory, since: Date.now(), busy: 0 }
        fans.set(userId, fan)
        listen(fan)
    }
    fan.active = true
    fan.lang = lang
    fan.memory = memory
    await publish(fan)
    if (isNew) {
        await fan.member.post(fan.userId, `New fan in ${LANG_NAME[lang] ?? lang}. I'm their agent.`, { kind: "note" })
        await say(fan, WELCOME[lang] ?? WELCOME.en, "Welcomed them and asked for their pick.", "note")
    } else if (!wasActive) await catchUp(fan, cursor)
    return fan
}

export async function onFanLeft(userId: string, cursor: number) {
    const fan = fans.get(userId)
    if (!fan) return
    fan.active = false
    await fanActor(userId).markSeen(cursor)
    await room.removeFanAgent(userId)
}

export async function onVote(userId: string, player: string, clock: string) {
    const fan = fans.get(userId)
    await fanActor(userId).recordPick(player, clock)
    if (!fan) return
    fan.memory = { ...fan.memory, favourite: player, picks: [...fan.memory.picks, { player, at: clock }] }
    await publish(fan)
}

export async function onQuestion(userId: string, text: string) {
    await fanActor(userId).recordQuestion(text)
}

export async function onPurchase(userId: string, offer: Offer) {
    await fanActor(userId).recordPurchase(offer.title, offer.priceEur)
}

/** After an agents restart: fans still connected get their agents back, without a welcome. */
export async function restoreFans() {
    const state = await room.getState()
    const connected = await room.getFans()
    const ids = new Set(connected.map(c => c.userId))
    for (const f of state.fanAgents) if (!ids.has(f.userId)) await room.removeFanAgent(f.userId)
    for (const c of connected) await onFanJoined(c.userId, c.lang, state.cursor, { restored: true })
}

/** On a replay reset, fans keep their agents (and memories); offers are cleared by the actor. */
export function activeFans() {
    return [...fans.values()].filter(f => f.active)
}

// ---- What each fan's agent does, listening on the relay ----

function listen(fan: Fan) {
    fan.member.on(async m => {
        if (!fan.active) return
        // Every match event: remember how far this fan has seen, and react to goals.
        if (m.from === "ingest" && m.data?.eventId !== undefined) {
            const e = EVENTS[m.data.eventId]
            if (!e) return
            await fanActor(fan.userId).markSeen(e.id + 1)
            if (e.type === "goal") await task(fan, () => goalMoment(fan, e))
        }
        // The general offer is live: if this fan called the scorer, get them something better.
        if (m.from === "merch" && m.data?.offer && m.data.eventId !== undefined) {
            const e = EVENTS[m.data.eventId]
            if (e && fan.memory.favourite === e.player) await task(fan, () => personalOffer(fan, e, m.data.offer as Offer))
        }
    })
}

function pickGoals(player: string | undefined, upTo: number) {
    if (!player) return 0
    return EVENTS.slice(0, upTo + 1).filter(x => x.type === "goal" && x.player === player).length
}

async function goalMoment(fan: Fan, e: MatchEvent) {
    const pick = fan.memory.favourite
    const called = pick === e.player
    const score = `${HOME} ${e.score.home}-${e.score.away} ${AWAY}`
    const facts = [
        `Goal at ${e.clock}: ${e.player} (${e.team}), his ${ordinal(goalsBy(e))} goal of the match. Score now ${score}.`,
        pick ? `The fan's pick for the next goal was ${pick}. ${called ? "They called it correctly." : `${pick} has ${pickGoals(pick, e.id)} goal(s) so far.`}` : "The fan has not made a pick yet.",
    ].join("\n")
    const text = await phrase(fan,
        called ? "Congratulate them on calling the scorer, in one short line (max 18 words)."
            : pick ? "Tell them the news in one short line (max 18 words), mentioning their own pick."
                : "Tell them the news in one short line (max 18 words) and invite them to pick who scores next.",
        facts)
        ?? (called ? `You called it: ${e.player} scores. ${score}.` : `${e.player} scores. ${score}.${pick ? ` Your pick: ${pick}.` : " Make your pick for the next goal."}`)
    await say(fan, text, called ? `Goal by their pick ${e.player}. Told them they called it.` : `Goal by ${e.player}; their pick is ${pick ?? "none yet"}. Sent a personal line.`)
}

async function personalOffer(fan: Fan, e: MatchEvent, general: Offer) {
    // Their pick scored: ask club-ops for more than the general offer, plus a free name print.
    const offer = await negotiateOffer(fan.member, e, { discountPct: general.discountPct + 5, bundle: "name print" })
    if (!offer || offer.id === general.id) return
    await room.sendPersonalOffer(fan.userId, offer)
    const text = await phrase(fan, "Tell them in one short line (max 18 words) that because they called the scorer, you got them a personal offer.",
        `Offer: ${offer.title}, €${offer.priceEur.toFixed(2)} (${offer.discountPct}% off). The general offer was ${general.discountPct}% off.`)
        ?? `You called it, so I got you a personal deal: ${offer.title}, €${offer.priceEur.toFixed(2)}.`
    await say(fan, text, `Negotiated a personal offer: ${offer.title}, €${offer.priceEur.toFixed(2)}.`)
}

async function catchUp(fan: Fan, cursor: number) {
    const from = fan.memory.lastSeenCursor
    if (from > cursor || cursor - from < 2) return // a new match, or nothing much missed
    const missed = (await room.getTimelineFrom(from)).filter(e => KEY.has(e.type) || e.type === "yellow_card")
    const state = await room.getState()
    const facts = [
        `They left at event ${from} and are back at ${state.clock}. Score now ${HOME} ${state.score.home}-${state.score.away} ${AWAY}.`,
        missed.length ? `What they missed: ${missed.map(e => `${e.clock} ${e.type.replace(/_/g, " ")}${e.player ? ` ${e.player} (${e.team})` : ""}`).join("; ")}.` : "No goals or cards while they were away.",
        fan.memory.favourite ? `Their pick: ${fan.memory.favourite}.` : "",
    ].join("\n")
    const text = await phrase(fan, "Welcome them back and catch them up in at most two short sentences, starting with 'While you were away'. " +
        "Report only the events listed under 'What they missed'; the current score is context, not news, and anything not listed happened before they left.", facts, 3500)
        ?? `While you were away: ${missed.map(e => `${e.clock} ${e.type.replace(/_/g, " ")} ${e.player ?? ""}`).join(", ") || "no goals"}. Now ${state.score.home}-${state.score.away}.`
    await say(fan, text, `They're back after ${cursor - from} events. Sent a catch-up.`)
}
