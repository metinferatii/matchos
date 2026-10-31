// Gateway: the only thing fans' devices talk to.
//  - GET  /connect?match=&userId=&lang=   -> { websocketUrl }   (same handshake as the mock)
//  - WS   /ws?match=&userId=&lang=        -> proxied to the MatchRoom actor socket (matchId= also works)
//  - GET  /api/state?match=               -> full room state (control room)
//  - POST /api/control?match=&action=start|pause|reset|speed|jump&value=
//  - static files from web/ (embed.js, widget, control room, club site)
// The actor dev server only listens on 127.0.0.1, so phones on the LAN go through this proxy.
import type { ServerWebSocket } from "bun"
import { join, normalize } from "node:path"
import { actors } from "./generated/index.js"
import type { Lang } from "../shared/contract"
import { LANGS } from "../shared/contract"

const PORT = Number(process.env.PORT ?? 8080)
const WEB = join(import.meta.dir, "../web")
const DEFAULT_MATCH = "wc22-final"

const ROOM_STATE = '{"type":"room_state"'

type Conn = { match: string; userId: string; lang: Lang; upstream?: WebSocket; queue: string[] }

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }
const room = (id: string) => actors.MatchRoom.get(id)

function params(url: URL) {
    const lang = url.searchParams.get("lang") as Lang
    return {
        // The RN SDK sends `matchId`; the web widget and /connect use `match`.
        match: url.searchParams.get("matchId") || url.searchParams.get("match") || DEFAULT_MATCH,
        userId: (url.searchParams.get("userId") || crypto.randomUUID()).slice(0, 64),
        lang: LANGS.includes(lang) ? lang : "en",
    }
}

async function openUpstream(ws: ServerWebSocket<Conn>) {
    const { match, userId, lang } = ws.data
    watched.add(match)
    try {
        const { websocketUrl } = await actors.MatchRoom.prepareWebsocket({ actorId: match, metadata: { userId, lang } })
        const up = new WebSocket(websocketUrl)
        ws.data.upstream = up
        up.addEventListener("open", () => {
            for (const m of ws.data.queue.splice(0)) up.send(m)
        })
        up.addEventListener("message", e => {
            const text = String(e.data)
            // Terse reserves "state", so the actor sends "room_state"; restore the contract name here.
            ws.send(text.startsWith(ROOM_STATE) ? '{"type":"state"' + text.slice(ROOM_STATE.length) : text)
        })
        up.addEventListener("close", () => ws.close(4001, "match server restarting"))
        up.addEventListener("error", () => ws.close(4001, "match server unavailable"))
    } catch {
        ws.close(4001, "match server unavailable")
    }
}

async function control(match: string, action: string, value: number) {
    const r = room(match)
    switch (action) {
        case "start": return r.start(value || undefined)
        case "pause": return r.pause()
        case "reset": return r.reset()
        case "speed": return r.setSpeed(value)
        case "jump": return r.jumpTo(value)
        default: throw new Error(`unknown action ${action}`)
    }
}

const server = Bun.serve<Conn>({
    port: PORT,
    hostname: "0.0.0.0",
    idleTimeout: 60,
    async fetch(req, srv) {
        const url = new URL(req.url)
        if (req.method === "OPTIONS") return new Response(null, { headers: cors })
        try {
            if (url.pathname === "/connect") {
                const p = params(url)
                const host = req.headers.get("host") ?? `localhost:${PORT}`
                const q = new URLSearchParams(p).toString()
                return Response.json({ websocketUrl: `ws://${host}/ws?${q}` }, { headers: cors })
            }
            if (url.pathname === "/ws") {
                if (srv.upgrade(req, { data: { ...params(url), queue: [] } })) return
                return new Response("expected websocket", { status: 400 })
            }
            if (url.pathname === "/api/state") {
                return Response.json(await room(url.searchParams.get("match") || DEFAULT_MATCH).getState(), { headers: cors })
            }
            if (url.pathname === "/api/control" && req.method === "POST") {
                const state = await control(url.searchParams.get("match") || DEFAULT_MATCH, url.searchParams.get("action") ?? "", Number(url.searchParams.get("value") ?? 0))
                return Response.json(state, { headers: cors })
            }
            if (url.pathname === "/match.json") return new Response(Bun.file(join(import.meta.dir, "../data/match.json")), { headers: cors })
            return serveStatic(url.pathname)
        } catch (err) {
            return Response.json({ error: String((err as Error).message ?? err) }, { status: 503, headers: cors })
        }
    },
    websocket: {
        open(ws) { void openUpstream(ws) },
        message(ws, raw) {
            const up = ws.data.upstream
            const text = String(raw)
            if (up?.readyState === WebSocket.OPEN) up.send(text)
            else ws.data.queue.push(text)
        },
        close(ws) { ws.data.upstream?.close() },
    },
})

async function serveStatic(pathname: string) {
    let path = normalize(join(WEB, decodeURIComponent(pathname)))
    if (!path.startsWith(WEB)) return new Response("not found", { status: 404 })
    if (pathname.endsWith("/")) path = join(path, "index.html")
    let file = Bun.file(path)
    if (!(await file.exists())) file = Bun.file(path + ".html")
    if (!(await file.exists())) return new Response("not found", { status: 404 })
    return new Response(file, { headers: { ...cors, "cache-control": "no-store" } })
}

// Watchdog: after an actor-server restart the replay alarm may need re-arming.
const watched = new Set([DEFAULT_MATCH])
setInterval(async () => {
    for (const id of watched) {
        try {
            const r = await room(id).ensureTicking()
            if (r.rearmed) console.log(`[watchdog] re-armed replay clock for ${id}`)
        } catch { /* actor server down; try again next tick */ }
    }
}, 2000)

console.log(`Gateway on http://localhost:${server.port}`)
