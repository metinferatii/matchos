// The producer: the newsroom boss. Every new event gets a directive (importance, tone, who acts),
// and normal/high commentary drafts get one review. Goals are never held up: their directive is
// rule-based and instant, and they are never reviewed.
import type { MatchEvent } from "../shared/contract"
import { EVENTS, FAST_MODEL, PERIOD, STEP_MS, describe, isGoal, llmJson, type Member } from "./core"

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
                `Event: ${describe(e)} (${PERIOD[e.period]}).\nPrevious events:\n${recent(e) || "(kick-off)"}`,
                STEP_MS - 100,
                { model: FAST_MODEL, maxTokens: 30 },
            ))
            if (out?.tone) d.tone = out.tone.slice(0, 80)
        }
        await producer.post("commentator", `${e.clock} ${d.importance.toUpperCase()} · tone: ${d.tone} · act: ${d.act.join(", ")}`, {
            kind: "directive", ref: e.id, data: d,
        })
    })

    // Review: one look at each normal/high draft; reject at most once with a concrete reason.
    producer.on(async m => {
        if (m.kind !== "draft" || m.from !== "commentator" || m.data?.eventId === undefined) return
        const e = EVENTS[m.data.eventId]
        if (!e || isGoal(e)) return
        const verdict = await producer.task(() => llmJson<{ approve?: boolean; reason?: string }>(
            "You are the producer reviewing one line of live football commentary before it is published. " +
            "Reject it only if it is generic, misses the key context of the moment (extra time, the shootout, the scoreline, a comeback), " +
            "states anything not in the event, or repeats a recent line. Otherwise approve. " +
            'Return JSON {"approve":true|false,"reason":"max 12 words, concrete fix"}.',
            `Event: ${describe(e)} (${PERIOD[e.period]}).\nTone asked: ${m.data.tone ?? "-"}\nDraft: ${m.data.line}\nRecent lines:\n${log.slice(-5).join("\n") || "(none)"}`,
            m.data.timeoutMs ?? STEP_MS - 100,
            { model: FAST_MODEL, maxTokens: 40, temperature: 0.2 },
        ))
        if (!verdict) return // timed out: the commentator publishes its draft
        if (verdict.approve === false && verdict.reason)
            await producer.post("commentator", `Rejected ${e.clock}: ${verdict.reason}`, { kind: "rejection", ref: e.id, data: { reason: verdict.reason } })
        else await producer.post("commentator", `Approved ${e.clock}.`, { kind: "agreement", ref: e.id })
    })
}
