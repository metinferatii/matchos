// Canned multilingual lines per event type. Used by the mock server, and as the fallback
// when an LLM call is slow or fails, so the feed never goes quiet on stage.
import type { Lang, MatchEvent } from "./contract.js"

const TEAM: Record<string, Record<Lang, string>> = {
    Argentina: { en: "Argentina", sq: "Argjentina", es: "Argentina", ar: "الأرجنتين" },
    France: { en: "France", sq: "Franca", es: "Francia", ar: "فرنسا" },
}

type Fill = { p: string; t: string; d: string; s: string }
type Tpl = (f: Fill) => string
// "Dybala replaces Tagliafico" -> "Dybala ⇄ Tagliafico" for non-English lines.
const swap = (d: string) => d.replace(" replaces ", " ⇄ ")

const T: Record<string, Record<Lang, Tpl>> = {
    kickoff: {
        en: () => "We're under way! The ball is rolling.",
        sq: () => "Ndeshja nis! Topi është në lojë.",
        es: () => "¡Arranca el partido! La pelota ya rueda.",
        ar: () => "انطلقت المباراة! الكرة تتدحرج الآن.",
    },
    half_end: {
        en: f => `The whistle goes. ${f.s} at the break.`,
        sq: f => `Fishkëllima! ${f.s} në pushim.`,
        es: f => `¡Pitazo! ${f.s} al descanso.`,
        ar: f => `صافرة الحكم! النتيجة ${f.s} عند الاستراحة.`,
    },
    goal: {
        en: f => `GOAL! ${f.p} scores for ${f.t}! ${f.s}.`,
        sq: f => `GOL! ${f.p} shënon për ${f.t}! ${f.s}.`,
        es: f => `¡GOOOL! ¡${f.p} marca para ${f.t}! ${f.s}.`,
        ar: f => `هدف! ${f.p} يسجل لـ${f.t}! ${f.s}.`,
    },
    shot_saved: {
        en: f => `${f.p} lets fly, but the keeper saves.`,
        sq: f => `${f.p} gjuan, por portieri pret.`,
        es: f => `¡Remate de ${f.p}, pero ataja el portero!`,
        ar: f => `تسديدة من ${f.p}، لكن الحارس يتصدى.`,
    },
    shot_missed: {
        en: f => `${f.p} goes for goal, just wide!`,
        sq: f => `${f.p} provon, pak jashtë!`,
        es: f => `¡${f.p} prueba, se va desviado!`,
        ar: f => `${f.p} يسدد، تمر الكرة بجانب القائم!`,
    },
    penalty_awarded: {
        en: f => `Penalty! ${f.p} gives it away in the box.`,
        sq: f => `Penallti! ${f.p} faulon në zonë.`,
        es: f => `¡Penalti! ${f.p} comete la falta en el área.`,
        ar: f => `ركلة جزاء! ${f.p} يرتكب خطأ داخل المنطقة.`,
    },
    yellow_card: {
        en: f => `Yellow card for ${f.p} (${f.t}).`,
        sq: f => `Karton i verdhë për ${f.p} (${f.t}).`,
        es: f => `Tarjeta amarilla para ${f.p} (${f.t}).`,
        ar: f => `بطاقة صفراء لـ${f.p} (${f.t}).`,
    },
    red_card: {
        en: f => `RED CARD! ${f.p} is off!`,
        sq: f => `KARTON I KUQ! ${f.p} përjashtohet!`,
        es: f => `¡ROJA! ¡${f.p} se va a la calle!`,
        ar: f => `بطاقة حمراء! ${f.p} خارج الملعب!`,
    },
    substitution: {
        en: f => `Change for ${f.t}: ${f.d}.`,
        sq: f => `Ndryshim për ${f.t}: ${swap(f.d)}.`,
        es: f => `Cambio en ${f.t}: ${swap(f.d)}.`,
        ar: f => `تبديل في ${f.t}: ${swap(f.d)}.`,
    },
    shootout_start: {
        en: () => "It's going to penalties! Nerves of steel needed.",
        sq: () => "Shkojmë në penallti! Duhen nerva çeliku.",
        es: () => "¡Nos vamos a los penaltis! Nervios de acero.",
        ar: () => "إلى ركلات الترجيح! الأعصاب الفولاذية مطلوبة.",
    },
    shootout_goal: {
        en: f => `${f.p} scores from the spot for ${f.t}.`,
        sq: f => `${f.p} shënon nga pika për ${f.t}.`,
        es: f => `${f.p} convierte desde los once metros para ${f.t}.`,
        ar: f => `${f.p} يسجل ركلة الترجيح لـ${f.t}.`,
    },
    shootout_miss: {
        en: f => `${f.p} misses! Huge moment for ${f.t}.`,
        sq: f => `${f.p} gabon! Moment i madh për ${f.t}.`,
        es: f => `¡Falla ${f.p}! Momento enorme para ${f.t}.`,
        ar: f => `${f.p} يهدر! لحظة حاسمة لـ${f.t}.`,
    },
    full_time: {
        en: () => "It's all over! Argentina are world champions!",
        sq: () => "Mbaroi! Argjentina është kampione e botës!",
        es: () => "¡Se terminó! ¡Argentina es campeona del mundo!",
        ar: () => "انتهت المباراة! الأرجنتين بطلة العالم!",
    },
}

export function templateLine(e: MatchEvent, lang: Lang): string {
    const team = e.team ? TEAM[e.team]?.[lang] ?? e.team : ""
    const s = e.period === 5 && e.shootout
        ? `${e.shootout.home}-${e.shootout.away}`
        : `${e.score.home}-${e.score.away}`
    const tpl = T[e.type]?.[lang]
    return tpl ? tpl({ p: e.player ?? "", t: team, d: e.detail, s }) : e.detail
}
