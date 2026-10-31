// Live hiring: when a fan arrives in a language nobody covers, the producer hires a translator for it.
// Each hire is a new Agent Relay participant ("translator-ja") with its own listener, recorded on the
// actor's persisted roster so a restarted agents process brings the same people back.
import type { FanLang } from "../shared/contract"
import { Member, llm, room, type Msg } from "./core"

export const LANG_NAME: Record<string, string> = {
    en: "English", sq: "Albanian", es: "Spanish", ar: "Arabic", ja: "Japanese", fr: "French", de: "German", tr: "Turkish",
}

type Hire = { member: Member; active: boolean }
const hires = new Map<string, Hire>()
const pending = new Set<string>()

const translate = (lang: string, line: string, timeoutMs: number) =>
    llm(
        `Translate this line of live football commentary into natural, energetic ${LANG_NAME[lang]}. ` +
        "Keep player names as given. Keep it as short as the original. Reply with the translation only.",
        line,
        { timeoutMs, temperature: 0.3 },
    )

/** Brings a translator for `lang` onto the team. `restored` skips the backfill and says it's back. */
export async function spawnTranslator(lang: FanLang, hiredBy: string, restored = false): Promise<void> {
    const existing = hires.get(lang)
    if ((existing?.active || pending.has(lang)) && !restored) return
    pending.add(lang)
    try {
        const name = `translator-${lang}`
        let hire = existing
        if (!hire) {
            const member = await Member.join(name)
            hire = { member, active: true }
            hires.set(lang, hire)
            // Every final commentary line, from now on, in this language.
            member.on(async (m: Msg) => {
                if (!hire!.active || m.from !== "commentator" || m.data?.line === undefined) return
                const left = (m.data.publishBy ?? Date.now() + 2000) - Date.now() - 60
                const text = (await member.task(() => translate(lang, m.data.line, Math.max(400, left)))) ?? m.data.line
                await room.postExtraCommentary(m.data.eventId, lang, text)
            }, ["translators"])
        }
        hire.active = true
        await room.hireAgent({ name, role: `translator (${lang})`, lang, hiredBy })
        const state = await room.getState()
        if (restored) {
            await hire.member.post("all", `${name} back on shift, restored from the roster. Covering ${LANG_NAME[lang]} from ${state.clock}.`, { kind: "note" })
            return
        }
        await hire.member.post("all", `${name} here. I cover ${LANG_NAME[lang]} from ${state.clock}.`, { kind: "note" })
        // Backfill the latest line so the new fan isn't staring at an empty feed.
        const latest = [...state.feed.en].reverse().find(i => i.kind === "commentary")
        if (latest) {
            const text = await hire.member.task(() => translate(lang, latest.text, 3000))
            if (text) {
                await room.postExtraCommentary(null, lang, text)
                await hire.member.post("all", `Backfilled the latest line for ${LANG_NAME[lang]} fans.`, { kind: "note" })
            }
        }
    } finally {
        pending.delete(lang)
    }
}

/** On a replay reset the hired translators are let go (the actor clears them from the roster too). */
export function releaseHires() {
    for (const h of hires.values()) h.active = false
}

export const isCovered = (lang: string) => hires.get(lang)?.active || pending.has(lang)

/** After a restart: everyone the producer hired earlier comes back from the persisted roster. */
export async function restoreHires() {
    const roster = await room.getRoster()
    for (const r of roster) if (r.hiredBy && r.lang) await spawnTranslator(r.lang, r.hiredBy, true)
}

/** The producer's side: a fan arrived in an uncovered language, so hire for it. */
export function startHiring(producer: Member) {
    producer.on(async m => {
        if (m.from !== "ingest" || !m.data?.languageNeeded) return
        const { lang, fans } = m.data.languageNeeded as { lang: FanLang; fans: number }
        if (isCovered(lang) || !LANG_NAME[lang]) return
        await producer.post("all", `Hiring a ${LANG_NAME[lang]} translator for ${fans} new fan${fans > 1 ? "s" : ""}.`, { kind: "hire", data: { lang } })
        await producer.task(() => spawnTranslator(lang, "producer"))
    })
}
