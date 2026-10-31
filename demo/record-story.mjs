// Records the launch story as separate, synchronized clips: each fan's own surface plus the control room.
//   cd demo && node record-story.mjs          (needs ./scripts/dev.sh running)
// Output: demo/out/story/{arta,diego,kenji,sam,control}.mp4 + timeline.json (beat times in seconds from
// the shared start of every clip). The fans act on camera: picks, a purchase, a question, leaving and
// coming back, a late joiner in a new language, and the server being killed and restarted.
import { chromium } from "playwright"
import { execSync, spawnSync } from "node:child_process"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const OUT = join(import.meta.dirname, "out", "story")
const BASE = process.env.BASE ?? "http://localhost:8080"
const RUN = Math.random().toString(36).slice(2, 6) // fresh fan memories every recording
const widget = (lang, userId) => `${BASE}/widget.html?${new URLSearchParams({ match: "wc22-final", lang, userId, fill: "1" })}`

const SURFACES = {
    arta: { w: 430, h: 932, dsf: 2, url: widget("sq", `arta-tirana-${RUN}`) },
    diego: { w: 430, h: 932, dsf: 2, url: widget("es", `diego-buenos-aires-${RUN}`) },
    kenji: { w: 430, h: 932, dsf: 2, url: widget("ja", `kenji-tokyo-${RUN}`) },
    sam: { w: 1440, h: 900, dsf: 1, url: `${BASE}/club.html` },
    control: { w: 1920, h: 1080, dsf: 1, url: `${BASE}/control.html` },
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const control = q => fetch(`${BASE}/api/control?${q}`, { method: "POST" }).then(r => r.json())
const state = () => fetch(`${BASE}/api/state`).then(r => r.json())
async function untilCursor(n, timeoutMs = 60_000) {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) { if ((await state()).cursor >= n) return; await sleep(200) }
}
const DARK = `<html><body style="margin:0;background:#0b0b0b;height:100vh"></body></html>`

// ---- Stage: match paused just before Messi's 23' penalty ----
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
await control("action=reset")
await sleep(1500)
await control("action=speed&value=4000")
await control("action=jump&value=3")

const browser = await chromium.launch()
const pages = {}
for (const [id, s] of Object.entries(SURFACES)) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dsf, hasTouch: s.dsf > 1 })
    pages[id] = await ctx.newPage()
}
// The control room and Sam's club page are already open; the phones open on camera.
await pages.control.goto(SURFACES.control.url)
await pages.sam.goto(SURFACES.sam.url)
for (const id of ["arta", "diego", "kenji"]) await pages[id].setContent(DARK)
await sleep(5000)
// Sam's page scrolled so the live match card is in view.
await pages.sam.evaluate(() => document.querySelector("iframe")?.scrollIntoView({ block: "start" }))
await pages.sam.evaluate(() => window.scrollBy(0, -24))

// ---- Recording: one screencast per surface, all against the same clock ----
const frames = Object.fromEntries(Object.keys(SURFACES).map(id => [id, []]))
for (const [id, s] of Object.entries(SURFACES)) {
    mkdirSync(join(OUT, "frames", id), { recursive: true })
    const cdp = await pages[id].context().newCDPSession(pages[id])
    cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
        const file = join(OUT, "frames", id, `${String(frames[id].length).padStart(5, "0")}.jpg`)
        writeFileSync(file, Buffer.from(data, "base64"))
        frames[id].push({ file, t: metadata.timestamp })
        await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {})
    })
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: s.w * s.dsf, maxHeight: s.h * s.dsf, everyNthFrame: 1 })
}
const t0 = Date.now() / 1000
const beats = []
const now = () => +(Date.now() / 1000 - t0).toFixed(2)
const beat = (id, label, surfaces) => { beats.push({ t: now(), id, label, surfaces }); console.log(`${now().toFixed(1).padStart(5)}s  ${id}`) }

/** Clicks like a finger: a soft circle where the tap lands, then the click. */
async function tap(page, locator) {
    const el = typeof locator === "string" ? page.locator(locator).first() : locator
    const box = await el.boundingBox().catch(() => null)
    if (box) await page.evaluate(([x, y]) => {
        const d = document.createElement("div")
        Object.assign(d.style, { position: "fixed", left: `${x - 22}px`, top: `${y - 22}px`, width: "44px", height: "44px", borderRadius: "50%",
            background: "rgba(255,255,255,.35)", border: "2px solid rgba(255,255,255,.8)", zIndex: 99999, pointerEvents: "none",
            transition: "transform .5s ease, opacity .5s ease" })
        document.body.append(d)
        requestAnimationFrame(() => { d.style.transform = "scale(1.6)"; d.style.opacity = "0" })
        setTimeout(() => d.remove(), 700)
    }, [box.x + box.width / 2, box.y + box.height / 2])
    await sleep(180)
    await el.click({ timeout: 3000 }).catch(() => el.evaluate(n => n.click()).catch(() => {}))
}
const samFrame = () => pages.sam.frames().find(f => f.url().includes("widget.html"))

await sleep(800)
beat("open", "Arta in Tirana and Diego in Buenos Aires open the club app; Sam in London is on the club's match page", ["arta", "diego", "sam"])
await pages.arta.goto(SURFACES.arta.url)
await sleep(1200)
await pages.diego.goto(SURFACES.diego.url)
await sleep(5000) // each fan's agent says hello

beat("picks", "Arta picks Messi, Diego picks Di María", ["arta", "diego"])
await tap(pages.arta, 'button[data-p="Messi"]')
await sleep(1200)
await tap(pages.diego, 'button[data-p="Di María"]')
await sleep(2500)

await control("action=start&value=4000")
await untilCursor(5)
beat("goal-messi", "Messi scores. Every surface updates; Arta's agent says she called it, Diego's says something else", ["arta", "diego", "sam", "control"])
await sleep(2500)
await control("action=pause")
beat("agents-negotiate", "Arta's agent negotiates a personal offer with club-ops", ["control", "arta"])
await sleep(3500)

beat("arta-buys", "Arta buys the offer her agent got her", ["arta"])
await tap(pages.arta, "#buyBtn")
await sleep(3500)

beat("sam-asks", "Sam asks the match a question on the club site", ["sam"])
const f = samFrame()
if (f) {
    const input = f.locator("#askInput")
    await tap(pages.sam, input)
    await input.pressSequentially("Who has scored so far?", { delay: 55 })
    await input.press("Enter")
}
await sleep(5000)

await control("action=start&value=4000")
await untilCursor(6)
beat("goal-dimaria", "Di María scores. Now it's Diego who called it", ["diego", "arta", "control"])
await sleep(3000)
await control("action=pause")
await sleep(3500)

beat("arta-leaves", "Arta closes the app", ["arta"])
// A real navigation, so the app's connection actually closes (setContent alone can keep it alive).
await pages.arta.goto("about:blank")
await pages.arta.setContent(DARK)
await control("action=start&value=4000")
await sleep(8500)
await control("action=pause")

beat("kenji-joins", "Kenji in Tokyo joins in Japanese. Nobody covers it, so the producer hires a translator", ["kenji", "control"])
await pages.kenji.goto(SURFACES.kenji.url)
await sleep(9000)
await control("action=start&value=4000")
await sleep(6000)
await control("action=pause")

beat("arta-returns", "Arta comes back. Her agent tells her what she missed", ["arta"])
await pages.arta.goto(SURFACES.arta.url)
await sleep(7000)
await control("action=start&value=4000")
await sleep(3000)

const killedAt = (await state()).clock
beat("kill", `The match server is killed at ${killedAt}`, ["arta", "diego", "kenji", "sam", "control"])
execSync(`"${join(ROOT, "scripts/dev.sh")}" actor-stop`, { stdio: "ignore" })
await sleep(4500)
execSync(`"${join(ROOT, "scripts/dev.sh")}" actor-start`, { stdio: "ignore" })
const back = (await state()).clock
beat("resume", `Back at ${back}: every fan, every agent, every offer resumes`, ["arta", "diego", "kenji", "sam", "control"])
await sleep(7000)
beat("end", "End", [])
await sleep(500)
const tEnd = Date.now() / 1000
await browser.close()
await control("action=pause")

// ---- Encode every surface on the shared clock (black until its first frame) ----
for (const [id, s] of Object.entries(SURFACES)) {
    const list = frames[id]
    if (!list.length) continue
    const black = join(OUT, "frames", id, "black.jpg")
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=0x0b0b0b:s=${s.w * s.dsf}x${s.h * s.dsf}`, "-frames:v", "1", black])
    const entries = [`file '${black}'\nduration ${Math.max(0.001, list[0].t - t0).toFixed(4)}`]
    list.forEach((fr, i) => entries.push(`file '${fr.file}'\nduration ${Math.max(0.001, (list[i + 1]?.t ?? tEnd) - fr.t).toFixed(4)}`))
    entries.push(`file '${list.at(-1).file}'`)
    writeFileSync(join(OUT, `${id}.txt`), entries.join("\n") + "\n")
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(OUT, `${id}.txt`),
        "-vf", `fps=30,scale=${s.w * s.dsf}:${s.h * s.dsf},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-movflags", "+faststart", join(OUT, `${id}.mp4`)])
    console.log(`${id}: ${list.length} frames ${r.status === 0 ? "→ " + id + ".mp4" : "ffmpeg failed"}`)
}
writeFileSync(join(OUT, "timeline.json"), JSON.stringify({ durationS: +(tEnd - t0).toFixed(2), run: RUN, beats }, null, 2))
console.log(`timeline.json: ${beats.length} beats, ${(tEnd - t0).toFixed(1)}s`)
