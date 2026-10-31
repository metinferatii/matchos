// Mock match server: replays data/match.json over the real message contract with canned
// multilingual commentary, so client work can proceed without the actor backend.
//
//   bun mock/server.ts            (PORT=8790, TICK_MS=3000)
//
// Handshake (same as the real gateway):
//   GET /connect?match=wc22-final&userId=u1&lang=sq  ->  { websocketUrl }
// then open websocketUrl. You can also connect straight to ws://HOST:8790/ws?userId=u1&lang=sq
import type { ServerWebSocket } from "bun"
import match from "../data/match.json"
import type { AgentMsg, ClientMsg, FeedItem, Lang, MatchEvent, Offer, Predictions, ServerMsg, SocketMeta } from "../shared/contract"
import { LANGS } from "../shared/contract"
import { templateLine } from "../shared/templates"

const PORT = Number(process.env.PORT ?? 8790)
const TICK_MS = Number(process.env.TICK_MS ?? 3000)
const events = match.events as MatchEvent[]

let cursor = 0
let score = { home: 0, away: 0 }
let minute = "0'"
let offer: Offer | null = null
let predictions: Predictions = {}
const voted = new Map<string, string>()
const feed: Record<Lang, FeedItem[]> = { en: [], sq: [], es: [], ar: [] }
const sockets = new Set<ServerWebSocket<SocketMeta>>()

const send = (ws: ServerWebSocket<SocketMeta>, msg: ServerMsg) => ws.send(JSON.stringify(msg))
const broadcast = (msg: ServerMsg, lang?: Lang) => {
    for (const ws of sockets) if (!lang || ws.data.lang === lang) send(ws, msg)
}
const agent = (from: string, to: string, text: string) => {
    const msg: AgentMsg = { from, to, text, ts: Date.now() }
    broadcast({ type: "agent", msg })
}
const pushFeed = (lang: Lang, kind: FeedItem["kind"], text: string) => {
    const item: FeedItem = { id: crypto.randomUUID(), minute, lang, kind, text }
    feed[lang] = [...feed[lang], item].slice(-100)
    broadcast({ type: "feed", item }, lang)
}

function tick() {
    if (cursor >= events.length) {
        // Loop the replay after full time so the mock never runs dry.
        cursor = 0; score = { home: 0, away: 0 }; offer = null; predictions = {}; voted.clear()
        for (const l of LANGS) feed[l] = []
        broadcast({ type: "offer", offer: null })
    }
    const e = events[cursor++]
    minute = e.clock
    agent("ingest", "#match", `${e.clock} ${e.type} ${e.player ?? ""} (${e.team ?? "-"})`.trim())
    const en = templateLine(e, "en")
    agent("commentator", "#match", en)
    for (const lang of LANGS) pushFeed(lang, "commentary", templateLine(e, lang))
    agent("translator", "#match", "Translated to sq, es, ar")

    if (e.score.home !== score.home || e.score.away !== score.away || e.type === "kickoff") {
        score = { ...e.score }
        broadcast({ type: "score", home: score.home, away: score.away, minute })
    }
    if (e.type === "goal" && e.player) {
        offer = {
            id: crypto.randomUUID(),
            player: e.player,
            title: `${e.player} ${e.team} home jersey`,
            priceEur: 89.99,
            discountPct: 20,
            expiresAt: Date.now() + 10 * 60_000,
        }
        agent("merch", "#match", `Flash offer live: ${offer.title}, ${offer.discountPct}% off for 10 min`)
        broadcast({ type: "offer", offer })
        predictions = {}
        voted.clear()
    }
}

function answer(text: string): string {
    const q = text.toLowerCase()
    const goals = events.slice(0, cursor).filter(e => e.type === "goal")
    if (q.includes("who") && q.includes("scor"))
        return goals.length ? `Goals so far: ${goals.map(g => `${g.player} ${g.clock}`).join(", ")}.` : "No goals yet."
    if (q.includes("score")) return `It's ${score.home}-${score.away} at ${minute}.`
    if (q.includes("card")) {
        const cards = events.slice(0, cursor).filter(e => e.type.endsWith("_card"))
        return cards.length ? `Cards: ${cards.map(c => `${c.player} ${c.clock}`).join(", ")}.` : "No cards yet."
    }
    return `(mock) It's ${score.home}-${score.away} at ${minute}. The real stats agent will answer this properly.`
}

const server = Bun.serve<SocketMeta>({
    port: PORT,
    hostname: "0.0.0.0",
    fetch(req, srv) {
        const url = new URL(req.url)
        const cors = { "access-control-allow-origin": "*" }
        const lang = (LANGS.includes(url.searchParams.get("lang") as Lang) ? url.searchParams.get("lang") : "en") as Lang
        const userId = url.searchParams.get("userId") ?? crypto.randomUUID()
        if (url.pathname === "/connect") {
            const host = req.headers.get("host") ?? `localhost:${PORT}`
            return Response.json({ websocketUrl: `ws://${host}/ws?userId=${encodeURIComponent(userId)}&lang=${lang}` }, { headers: cors })
        }
        if (url.pathname === "/ws" && srv.upgrade(req, { data: { userId, lang } })) return
        if (url.pathname === "/match.json") return Response.json(match, { headers: cors })
        return new Response("Matchday OS mock server. GET /connect?userId=&lang=  or  ws /ws?userId=&lang=", { headers: cors })
    },
    websocket: {
        open(ws) {
            sockets.add(ws)
            send(ws, { type: "state", score, minute, feed: feed[ws.data.lang], offer, predictions })
        },
        close(ws) { sockets.delete(ws) },
        message(ws, raw) {
            let msg: ClientMsg
            try { msg = JSON.parse(String(raw)) } catch { return }
            if (msg.type === "vote") {
                const prev = voted.get(ws.data.userId)
                if (prev) predictions = { ...predictions, [prev]: Math.max(0, (predictions[prev] ?? 1) - 1) }
                voted.set(ws.data.userId, msg.player)
                predictions = { ...predictions, [msg.player]: (predictions[msg.player] ?? 0) + 1 }
                // Predictions ride along on the state message; re-send so every client sees new counts.
                for (const s of sockets) send(s, { type: "state", score, minute, feed: feed[s.data.lang], offer, predictions })
            } else if (msg.type === "ask") {
                agent("stats", "#match", `Q: ${msg.text}`)
                const item: FeedItem = { id: crypto.randomUUID(), minute, lang: ws.data.lang, kind: "answer", text: answer(msg.text) }
                send(ws, { type: "feed", item })
            } else if (msg.type === "buy") {
                agent("merch", "#match", `Order placed by ${ws.data.userId} for offer ${msg.offerId}`)
                const item: FeedItem = { id: crypto.randomUUID(), minute, lang: ws.data.lang, kind: "system", text: "Order confirmed! 🎉" }
                send(ws, { type: "feed", item })
            }
        },
    },
})

setInterval(tick, TICK_MS)
console.log(`Mock match server on http://${server.hostname}:${server.port} (tick ${TICK_MS}ms, ${events.length} events)`)
