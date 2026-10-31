// Scores a newsroom rehearsal (.logs/newsroom/) against the test list. Prints PASS/FAIL per item.
//   bun scripts/newsroom-check.ts [path-to-matchos-rn]
import { existsSync, readFileSync } from "node:fs"

const R = ".logs/newsroom"
const read = (f: string) => (existsSync(`${R}/${f}`) ? readFileSync(`${R}/${f}`, "utf8") : "")
const agents = read("agents-1.log") + read("agents-2.log")
const lines = agents.split("\n")
const results: [boolean, string, string][] = []
const check = (ok: boolean, name: string, detail: string) => results.push([ok, name, detail])
const count = (re: RegExp) => lines.filter(l => re.test(l)).length

// 1. Producer: a directive for every key event, and at least one rejection followed by a real rewrite.
const keyEvents = lines.filter(l => /^ingest +→ all +\S+ (GOAL|PENALTY AWARDED|RED CARD|SHOOTOUT|FULL TIME)/.test(l)).map(l => l.split(/\s+/)[3])
const directed = new Set(lines.filter(l => /\[directive\] \S+ (LOW|NORMAL|HIGH|HUGE)/.test(l)).map(l => l.match(/\[directive\] (\S+)/)![1]))
const missing = keyEvents.filter(c => !directed.has(c))
check(keyEvents.length > 0 && missing.length === 0, "producer directives on every key event", `${keyEvents.length} key events, missing: ${missing.join(" ") || "none"}; ${count(/\[directive\]/)} directives in all`)
let rewrites = 0
lines.forEach((l, i) => {
    if (!/\[rejection\]/.test(l)) return
    const draft = [...lines.slice(0, i)].reverse().find(x => /commentator +→ producer +\[draft\]/.test(x))?.split("[draft] ")[1]
    const final = lines.slice(i + 1).find(x => /^commentator +→ translators/.test(x))?.replace(/^commentator +→ translators +/, "")
    if (draft && final && draft.trim() !== final.trim()) rewrites++
})
check(count(/\[rejection\]/) >= 1 && rewrites >= 1, "at least one rejection and rewrite", `${count(/\[draft\]/)} drafts, ${count(/\[rejection\]/)} rejections, ${rewrites} rewritten`)

// 2. Hiring: hire, intro, backfill, Japanese commentary after.
const ja = read("fan-ja.log")
const jaLines = ja.split("\n").filter(l => /FEED .*\[commentary\]/.test(l) && /[぀-ヿ一-龯]/.test(l)).length
check(/\[hire\] Hiring a Japanese translator/.test(agents) && /translator-ja here/.test(agents) && /Backfilled/.test(agents) && jaLines >= 5,
    "Japanese fan triggers hire, backfill and Japanese commentary", `${jaLines} Japanese commentary lines received`)

// 3. Negotiation: proposal, counter, agreement, and stock going down.
const sold = count(/^merch +→ all +Sold .*jersey/)
const stockNotes = lines.filter(l => /Stock update/.test(l))
check(count(/\[proposal\]/) >= 1 && count(/\[counter\]/) >= 1 && count(/\[agreement\]/) >= 1 && stockNotes.length >= 1,
    "goal → proposal, counter, agreed offer; purchase lowers stock", `${count(/\[proposal\]/)} proposals, ${count(/\[counter\]/)} counters, ${sold} jerseys sold; ${stockNotes.slice(-2).map(l => l.split("[note] ")[1]).join(" | ")}`)
check(/Stock too low/.test(agents), "a later offer refused for low stock", lines.find(l => /Stock too low/.test(l))?.split("[counter] ")[1] ?? "no low-stock counter")

// 4. Initiative: a nugget, a mood note, and the producer acting on it.
check(/\[initiative\] Quiet spell/.test(agents), "quiet spell produces a stats nugget", `${count(/Quiet spell/)} nuggets`)
check(/^crowd +→ producer/m.test(agents) && /^producer +→ stats +\[directive\]/m.test(agents) && /Posted an explainer/.test(agents),
    "crowd mood note, producer acts, explainer posted", lines.find(l => /^crowd +→ producer/.test(l))?.split("[note] ")[1] ?? "no mood note")

// 5. Kill and resume in extra time.
const before = JSON.parse(read("restart-before.json") || "{}"), after = JSON.parse(read("restart-after.json") || "{}")
// The replay can tick once between the snapshot and the kill; resuming at that saved event is correct.
check(after.cursor - before.cursor >= 0 && after.cursor - before.cursor <= 1 && JSON.stringify(before.stock) === JSON.stringify(after.stock) && after.hired?.includes("translator-ja"),
    "actor restart: match, roster and stock resume", `cursor ${before.cursor} → ${after.cursor}; hired ${after.hired?.join(",")}; stock equal: ${JSON.stringify(before.stock) === JSON.stringify(after.stock)}`)
check(/translator-ja back on shift/.test(read("agents-2.log")), "agents restart restores the hired translator from the roster", "")

// 6. Every fan finished the match.
for (const l of ["en", "sq", "es", "ar", "ja"]) {
    const log = read(`fan-${l}.log`)
    const last = log.split("\n").filter(x => /SCORE/.test(x)).pop() ?? ""
    check(/3-3 PENS|3-3 125/.test(last), `${l} fan reached full time`, `${last.trim()} · ${(log.match(/closed/g) ?? []).length} reconnects`)
}

const pass = results.filter(r => r[0]).length
for (const [ok, name, detail] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
console.log(`\n${pass}/${results.length} passed`)
