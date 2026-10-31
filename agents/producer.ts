// The producer: the newsroom boss. Every new event gets a directive (importance, tone, who acts),
// and normal/high commentary drafts get one review. Goals are never held up: their directive is
// rule-based and instant, and they are never reviewed.
import type { MatchEvent } from "../shared/contract"
import { AWAY, EVENTS, FAST_MODEL, HOME, PERIOD, STEP_MS, describe, isGoal, llmJson, type Member } from "./core"

export type Importance = "low" | "normal" | "high" | "huge"
export type Directive = { importance: Importance; tone: string; act: string[] }

const IMPORTANCE: Record<string, Importance> = {
    goal: "huge", full_time: "huge", shootout_start: "high",
    shootout_goal: "high", shootout_miss: "high", penalty_awarded: "high", red_card: "high",
    shot_saved: "normal", shot_missed: "normal", yellow_card: "normal", kickoff: "normal", half_end: "normal",
    substitution: "low",
}
const RULE_TONE: Record<Importance, string> = {
    huge: "electric, short, name the scorer and the score",
    high: "tense, make the stakes clear",
    normal: "lively, add the match context",
    low: "brief and factual",
}

/** The default directive, used instantly for goals and whenever the producer is slow or off. */
export function ruleDirective(e: MatchEvent): Directive {
    const importance = IMPORTANCE[e.type] ?? "normal"
    const act = ["commentator"]
    if (isGoal(e)) act.push("merch")
    if (importance === "huge" || importance === "high") act.push("stats")
    return { importance, tone: RULE_TONE[importance], act }
}

const REJECT_EVERY = Number(process.env.REJECT_EVERY ?? 3)

/** The hard facts at this event, spelled out so the producer can't misread who leads. */
function facts(e: MatchEvent): string {
    const { home, away } = e.score
    const lead = home === away ? "level" : `${home > away ? HOME : AWAY} lead, ${home > away ? AWAY : HOME} trail`
    const pens = e.period === 5 && e.shootout ? ` Shootout: ${HOME} ${e.shootout.home}-${e.shootout.away} ${AWAY}.` : ""
    return `Facts: ${e.clock}, ${PERIOD[e.period]}. Score ${HOME} ${home}-${away} ${AWAY} (${lead}).${pens}\nEvent: ${describe(e)}.`
}

const recent = (e: MatchEvent) => EVENTS.slice(Math.max(0, e.id - 4), e.id).map(describe).join("\n")

export function startProducer(producer: Member, log: string[]) {
    // Directives: every event from ingest.
    producer.on(async m => {
        if (m.from !== "ingest" || m.data?.eventId === undefined) return
        const e = EVENTS[m.data.eventId]
        if (!e) return
        const d = ruleDirective(e)
        // Only non-goal, non-trivial events get a model-chosen tone, inside the step budget.
        if (d.importance === "normal" || d.importance === "high") {
            const out = await producer.task(() => llmJson<{ tone?: string }>(
                "You are the producer of a live football fan feed. Give the commentator a tone note for the next line: " +
                "max 8 words, specific to this moment (e.g. mention extra time, a comeback, the shootout pressure). " +
                'Return JSON {"tone":"..."}. Use only facts in the event and context.',
                `${facts(e)}\nPrevious events:\n${recent(e) || "(kick-off)"}`,
                STEP_MS - 100,
                { model: FAST_MODEL, maxTokens: 30 },
            ))
            if (out?.tone) d.tone = out.tone.slice(0, 80)
        }
        await producer.post("commentator", `${e.clock} ${d.importance.toUpperCase()} · tone: ${d.tone} · act: ${d.act.join(", ")}`, {
            kind: "directive", ref: e.id, data: d,
        })
    })

    // Review: one look at each normal/high draft; reject at most once, and only for a reason that holds
    // up against the hard facts. Rejections are rationed (at most one in every REJECT_EVERY drafts) so
    // they stay meaningful and the feed keeps its pace.
    let draftsSinceRejection = REJECT_EVERY
    producer.on(async m => {
        if (m.kind !== "draft" || m.from !== "commentator" || m.data?.eventId === undefined) return
        const e = EVENTS[m.data.eventId]
        if (!e || isGoal(e)) return
        draftsSinceRejection++
        // A rule that can't be wrong: in extra time or the shootout, the line has to say so.
        const context = e.period === 5 ? { re: /shoot-?out|penalt|spot|kick/i, reason: "too generic, say it's the penalty shootout" }
            : e.period >= 3 ? { re: /extra[- ]time|overtime|\b1[01]\d'?/i, reason: "too generic, mention it's extra time" } : null
        if (context && !context.re.test(m.data.line) && draftsSinceRejection >= REJECT_EVERY) {
            draftsSinceRejection = 0
            await producer.post("commentator", `Rejected ${e.clock}: ${context.reason}.`, { kind: "rejection", ref: e.id, data: { reason: context.reason } })
            return
        }
        const verdict = await producer.task(() => llmJson<{ approve?: boolean; reason?: string }>(
            "You are the producer reviewing one line of live football commentary before it is published. " +
            "Be demanding but fair. Reject a draft that contradicts the facts below, or that is generic: it could describe any match, " +
            "or it misses what makes this moment matter (the scoreline, extra time, the shootout, a comeback). " +
            "Your reason must itself agree with the facts; never claim something the facts don't say. " +
            'Return JSON {"approve":true|false,"reason":"max 12 words, concrete fix"}.',
            `${facts(e)}\nTone asked: ${m.data.tone ?? "-"}\nDraft: ${m.data.line}\nRecent lines:\n${log.slice(-5).join("\n") || "(none)"}`,
            m.data.timeoutMs ?? STEP_MS - 100,
            { model: FAST_MODEL, maxTokens: 40, temperature: 0 },
        ))
        if (!verdict) return // timed out: the commentator publishes its draft
        // A reason that names the wrong phase of the match is itself a false fact: drop it.
        const reason = verdict.reason ?? ""
        const wrongPhase = (/extra[- ]time|overtime/i.test(reason) && e.period < 3) || (/shoot-?out/i.test(reason) && e.period < 5)
        if (verdict.approve === false && reason && !wrongPhase && draftsSinceRejection >= REJECT_EVERY) {
            draftsSinceRejection = 0
            await producer.post("commentator", `Rejected ${e.clock}: ${verdict.reason}`, { kind: "rejection", ref: e.id, data: { reason: verdict.reason } })
        } else await producer.post("commentator", `Approved ${e.clock}.`, { kind: "agreement", ref: e.id })
    })
}
