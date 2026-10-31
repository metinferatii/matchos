// Records the Matchday OS "aha" demo from the live control room, at 1920x1080.
//   cd demo && npm install && node record.mjs        (needs ./scripts/dev.sh running)
// Frames come from Chrome's screencast (sharper than Playwright's built-in recorder) and are
// encoded with the system ffmpeg into demo/out/matchday-os-demo.mp4.
import { chromium } from "playwright"
import { execSync, spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const OUT = join(import.meta.dirname, "out")
const FRAMES = join(OUT, "frames")
const BASE = process.env.BASE ?? "http://localhost:8080"
const W = 1920, H = 1080

const sleep = ms => new Promise(r => setTimeout(r, ms))
const control = q => fetch(`${BASE}/api/control?${q}`, { method: "POST" }).then(r => r.json())
const state = () => fetch(`${BASE}/api/state`).then(r => r.json())
async function untilCursor(n, timeoutMs = 60_000) {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) { if ((await state()).cursor >= n) return; await sleep(250) }
}

// ---- Set the stage: the match paused just before Messi's 23' penalty ----
rmSync(OUT, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })
await control("action=reset")
await sleep(1500)
await control("action=speed&value=4000")
await control("action=jump&value=3")

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
await page.goto(`${BASE}/control.html`)
await sleep(5000) // iframes load and their sockets connect

// Captions sit at the bottom of the left column, over the least important panel, so they never
// cover the newest agent messages.
await page.addStyleTag({ content: `
  #demo-cap { position: fixed; left: 30px; bottom: 48px; width: 440px; z-index: 9999; box-sizing: border-box;
    padding: 18px 22px 20px; background: rgba(12,12,12,.96); color: #f4f4f2;
    border-left: 4px solid var(--accent, #c1d991); border-radius: 6px; opacity: 0; transform: translateY(8px);
    font: 500 23px/1.36 -apple-system, "SF Pro Text", system-ui, sans-serif; letter-spacing: -.005em;
    transition: opacity .35s ease, transform .35s ease; }
  #demo-cap.on { opacity: 1; transform: translateY(0); }
  #demo-cap small { display: block; margin-bottom: 6px; color: #9a9a95; font-size: 14px; font-weight: 600;
    letter-spacing: .08em; text-transform: uppercase; }` })
await page.evaluate(() => { const d = document.createElement("div"); d.id = "demo-cap"; document.body.append(d) })
async function caption(label, text) {
    await page.evaluate(([l, t]) => {
        const d = document.getElementById("demo-cap")
        d.classList.remove("on")
        setTimeout(() => { d.innerHTML = `<small>${l}</small>${t}`; d.classList.add("on") }, 250)
    }, [label, text])
}
const hideCaption = () => page.evaluate(() => document.getElementById("demo-cap").classList.remove("on"))

// ---- Record ----
const cdp = await page.context().newCDPSession(page)
const frames = []
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(FRAMES, `${String(frames.length).padStart(5, "0")}.jpg`)
    writeFileSync(file, Buffer.from(data, "base64"))
    frames.push({ file, t: metadata.timestamp })
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {})
})
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
const t0 = Date.now()
const at = s => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${s}`)

at("title")
await caption("Matchday OS", "One script tag gives any club a live, multilingual, AI-run matchday.")
await sleep(4500)
await caption("Live replay", "The 2022 World Cup final. An AI newsroom on Agent Relay, one durable Terse actor per match.")
await control("action=start&value=4000")

await untilCursor(5) // Messi scores
at("goal")
await caption("Goal, 23'", "The club site and two phones update together, each in its own language.")
await sleep(3800) // let the offer negotiation land, then hold the moment
await control("action=pause")
await sleep(2700)
await caption("Agents negotiating", "Merch proposed 20% off Messi's jersey. Club ops capped it at 15%. They settled on a free scarf.")
await sleep(6500)

await caption("The producer", "Every event gets a directive. The commentator drafts, and the producer can send a line back.")
await control("action=start&value=4000")
await sleep(11000)

at("japanese fan")
await control("action=pause")
await caption("New fan, new language", "A fan joins in Japanese. Nobody covers it, so the producer hires a translator.")
await page.evaluate(() => { const s = document.getElementById("fanLang"); s.value = "ja"; s.dispatchEvent(new Event("change")); document.getElementById("btnFan").click() })
await sleep(6000)
await caption("Hired, live", "translator-ja joins Agent Relay, backfills the latest line, and covers every event from now on.")
await sleep(6000)
await control("action=start&value=4000")
await sleep(8000)

at("kill")
const killedAt = (await state()).clock
await caption("Durability", `We kill the match server at ${killedAt}.`)
execSync(`"${join(ROOT, "scripts/dev.sh")}" actor-stop`, { stdio: "ignore" })
await sleep(3000)
await caption("Server down", "Every fan screen is reconnecting. The match is frozen, not lost.")
await sleep(3500)
execSync(`"${join(ROOT, "scripts/dev.sh")}" actor-start`, { stdio: "ignore" })
const back = (await state()).clock // read the instant the server is up, before the next tick
at(`restarted: killed at ${killedAt}, back at ${back}`)
await caption("Restarted", back === killedAt
    ? `Back at ${back}, the exact moment it stopped. Score, feeds, offer, stock and the hired translator all resume.`
    : `Back at ${back}. Score, feeds, offer, stock and the hired translator all resume.`)
await sleep(9000)

at("end")
await caption("Matchday OS", "Stripe-style drop-in for matchday. Data: StatsBomb Open Data.")
await sleep(4000)
await hideCaption()
await sleep(600)
await cdp.send("Page.stopScreencast")
await browser.close()
await control("action=pause")

// ---- Encode: each frame shown until the next one arrived ----
const list = frames.map((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5
    return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`
}).join("\n") + `\nfile '${frames.at(-1).file}'\n`
writeFileSync(join(OUT, "frames.txt"), list)
const mp4 = join(OUT, "matchday-os-demo.mp4")
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(OUT, "frames.txt"),
    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", mp4], { stdio: "inherit" })
console.log(r.status === 0 ? `\n${frames.length} frames → ${mp4}` : "ffmpeg failed")
