// Builds data/match.json (~60 key events) from StatsBomb open data for the 2022 World Cup final.
// Data: StatsBomb Open Data (https://github.com/statsbomb/open-data)
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"

const MATCH_ID = 3869685
const RAW = "https://raw.githubusercontent.com/statsbomb/open-data/master/data"
const cache = `data/raw/events.json`

const events: any[] = existsSync(cache)
    ? JSON.parse(readFileSync(cache, "utf8"))
    : await fetch(`${RAW}/events/${MATCH_ID}.json`).then(r => r.json())

const SHORT: Record<string, string> = {
    "Lionel Andrés Messi Cuccittini": "Messi",
    "Kylian Mbappé Lottin": "Mbappé",
    "Ángel Fabián Di María Hernández": "Di María",
    "Alexis Mac Allister": "Mac Allister",
    "Rodrigo Javier De Paul": "De Paul",
    "Julián Álvarez": "Julián Álvarez",
    "Enzo Fernandez": "Enzo Fernández",
    "Randal Kolo Muani": "Kolo Muani",
    "Adrien Rabiot": "Rabiot",
    "Lautaro Javier Martínez": "Lautaro Martínez",
    "Gonzalo Ariel Montiel": "Montiel",
    "Kingsley Coman": "Coman",
    "Paulo Bruno Exequiel Dybala": "Dybala",
    "Aurélien Djani Tchouaméni": "Tchouaméni",
    "Leandro Daniel Paredes": "Paredes",
    "Damián Emiliano Martínez": "Emiliano Martínez",
    "Hugo Lloris": "Lloris",
    "Ousmane Dembélé": "Dembélé",
    "Olivier Giroud": "Giroud",
    "Marcus Thuram": "Thuram",
    "Marcos Javier Acuña": "Acuña",
    "Theo Bernard François Hernández": "Theo Hernández",
    "Eduardo Camavinga": "Camavinga",
    "Antoine Griezmann": "Griezmann",
    "Nahuel Molina Lucero": "Molina",
    "Youssouf Fofana": "Fofana",
    "Raphaël Varane": "Varane",
    "Ibrahima Konaté": "Konaté",
    "Germán Alejandro Pezzella": "Pezzella",
    "Jules Koundé": "Koundé",
    "Axel Disasi": "Disasi",
    "Nicolás Alejandro Tagliafico": "Tagliafico",
    "Nicolás Hernán Otamendi": "Otamendi",
    "Cristian Gabriel Romero": "Romero",
    "Dayotchanculle Oswald Upamecano": "Upamecano",
}
const name = (p?: { name: string }) => (p ? SHORT[p.name] ?? p.name : null)

type Out = {
    minute: number; second: number; period: number; type: string
    team: string | null; player: string | null; detail: string
    location: [number, number] | null
    score?: { home: number; away: number }; shootout?: { home: number; away: number }
}

const HOME = "Argentina"
const out: Out[] = []
const score = { home: 0, away: 0 }
const shootout = { home: 0, away: 0 }
const seenHalf = new Set<string>()
const PERIOD_NAME = ["", "First half", "Second half", "Extra time, first half", "Extra time, second half", "Penalty shootout"]

for (const e of events) {
    const t = e.type.name
    const base = {
        minute: e.minute, second: e.second, period: e.period,
        team: e.team?.name ?? null, player: name(e.player),
        location: e.location ? [e.location[0], e.location[1]] as [number, number] : null,
    }
    if (t === "Half Start" || t === "Half End") {
        const key = `${t}${e.period}`
        if (seenHalf.has(key)) continue
        seenHalf.add(key)
        const end = t === "Half End"
        const type = end ? (e.period === 5 ? "full_time" : "half_end") : (e.period === 5 ? "shootout_start" : "kickoff")
        out.push({ ...base, team: null, player: null, location: end ? null : [60, 40], type, detail: `${PERIOD_NAME[e.period]} ${end ? "ends" : "begins"}` })
        continue
    }
    if (t === "Shot") {
        const outcome = e.shot.outcome.name
        const isPen = e.shot.type.name === "Penalty"
        const side = e.team.name === HOME ? "home" : "away"
        if (e.period === 5) {
            const scored = outcome === "Goal"
            if (scored) shootout[side]++
            out.push({ ...base, type: scored ? "shootout_goal" : "shootout_miss", detail: scored ? "Scores in the shootout" : `Shootout kick ${outcome === "Saved" ? "saved" : "missed"}`, score: { ...score }, shootout: { ...shootout } })
            continue
        }
        if (outcome === "Goal") {
            score[side]++
            out.push({ ...base, type: "goal", detail: isPen ? "Penalty goal" : `Goal (${e.shot.body_part.name.toLowerCase()})`, score: { ...score } })
        } else if (outcome === "Saved" || (outcome === "Off T" && e.shot.statsbomb_xg > 0.08)) {
            out.push({ ...base, type: outcome === "Saved" ? "shot_saved" : "shot_missed", detail: outcome === "Saved" ? "Shot saved" : "Shot off target", score: { ...score } })
        }
        continue
    }
    const card = e.foul_committed?.card ?? e.bad_behaviour?.card
    if (card) {
        out.push({ ...base, type: card.name === "Red Card" ? "red_card" : "yellow_card", detail: card.name })
        continue
    }
    if (t === "Foul Committed" && e.foul_committed?.penalty) {
        out.push({ ...base, type: "penalty_awarded", detail: "Foul in the box, penalty awarded" })
        continue
    }
    if (t === "Substitution") {
        out.push({ ...base, location: null, type: "substitution", detail: `${name(e.substitution.replacement)} replaces ${name(e.player)}` })
    }
}

// The handball penalty in extra time is recorded on the shot, not as a foul; add a marker before Mbappé's 117' goal.
const etPen = out.findIndex(e => e.type === "goal" && e.period === 4 && e.team === "France")
if (etPen >= 0 && !out.slice(etPen - 3, etPen).some(e => e.type === "penalty_awarded"))
    out.splice(etPen, 0, { ...out[etPen], type: "penalty_awarded", player: "Montiel", team: "Argentina", detail: "Handball in the box, penalty awarded", score: undefined })

// Display clock with stoppage time, e.g. 45+7'.
function clock(period: number, minute: number): string {
    if (period === 5) return "PENS"
    const cap = [0, 45, 90, 105, 120][period]
    return minute >= cap && minute > 0 ? `${cap}+${minute - cap + 1}'` : `${minute + 1}'`
}

// Carry score forward on every event so clients can render from any one of them.
let cur = { home: 0, away: 0 }, so = { home: 0, away: 0 }
const final = out.map((e, i) => {
    cur = e.score ?? cur; so = e.shootout ?? so
    // displayMinute is the number fans see (StatsBomb counts from 0, so Messi's 23' penalty is minute 22).
    // Stoppage time stays at the period's cap (45+7' -> 45) so minutes never go backwards at half-time,
    // which matters to clients that sort the feed by minute (the RN SDK does).
    const cap = [0, 45, 90, 105, 120][e.period]
    const displayMinute = e.period === 5 ? e.minute : Math.min(e.minute + 1, cap)
    return { id: i, ...e, displayMinute, clock: clock(e.period, e.minute), score: { ...cur }, shootout: e.period === 5 ? { ...so } : undefined }
})

mkdirSync("data", { recursive: true })
writeFileSync("data/match.json", JSON.stringify({
    id: "wc22-final",
    statsbombMatchId: MATCH_ID,
    competition: "FIFA World Cup 2022 · Final",
    venue: "Lusail Stadium",
    home: { name: "Argentina", short: "ARG", color: "#75AADB" },
    away: { name: "France", short: "FRA", color: "#1B2C5C" },
    attribution: "Data: StatsBomb Open Data",
    events: final,
}, null, 1))
console.log(`${final.length} events`, final.map(e => `${e.minute}' ${e.type} ${e.player ?? ""} ${e.score.home}-${e.score.away}`).join("\n"))
