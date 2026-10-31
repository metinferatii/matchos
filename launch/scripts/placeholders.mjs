// Renders placeholder clips into public/story/ for any recording that does not exist yet.
// Pass --force to overwrite existing files. Real recordings are never touched without --force.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const force = process.argv.includes("--force")
const timeline = JSON.parse(readFileSync("public/story/timeline.json", "utf8"))
const kenjiAt = timeline.beats.find(b => b.id === "kenji-joins")?.t ?? 0
const clips = [
    ["arta", "phone", { name: "Arta", sub: "Tirana · phone · Shqip", color: "#3a2a2a" }],
    ["diego", "phone", { name: "Diego", sub: "Buenos Aires · phone · Español", color: "#2a3340" }],
    ["sam", "desktop", { name: "Sam", sub: "London · desktop · English", color: "#2d3a2a" }],
    ["kenji", "phone", { name: "Kenji", sub: "Tokyo · phone · 日本語", color: "#3a2f40", blankUntilS: kenjiAt }],
    ["control", "control", {}],
]
for (const [file, comp, props] of clips) {
    const out = `public/story/${file}.mp4`
    if (existsSync(out) && !force) { console.log(`skip ${out} (exists)`); continue }
    execFileSync("npx", ["remotion", "render", "src/placeholder/index.tsx", comp, out, "--codec", "h264", "--crf", "28", `--props=${JSON.stringify(props)}`, "--log", "error"], { stdio: "inherit" })
    console.log(`wrote ${out}`)
}
