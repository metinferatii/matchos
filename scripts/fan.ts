// Headless fan client for testing: connects through the gateway, prints what it receives, reconnects on drop.
//   bun scripts/fan.ts [lang] [gatewayUrl]
const lang = process.argv[2] ?? "en"
const base = process.argv[3] ?? "http://localhost:8080"
const userId = `fan-${lang}-${Math.random().toString(36).slice(2, 6)}`

async function connect() {
    try {
        const { websocketUrl } = await fetch(`${base}/connect?match=wc22-final&userId=${userId}&lang=${lang}`).then(r => r.json())
        const ws = new WebSocket(websocketUrl)
        ws.onmessage = e => {
            const m = JSON.parse(String(e.data))
            const t = new Date().toISOString().slice(11, 23)
            if (m.type === "state") console.log(t, "STATE", `${m.score.home}-${m.score.away}`, m.minute, `feed=${m.feed.length}`, m.offer ? `offer=${m.offer.title}` : "")
            else if (m.type === "score") console.log(t, "SCORE", `${m.home}-${m.away}`, m.minute)
            else if (m.type === "feed") console.log(t, "FEED", m.item.minute, `[${m.item.kind}]`, m.item.text)
            else if (m.type === "offer") console.log(t, "OFFER", m.offer?.title ?? null)
            else if (m.type === "agent") console.log(t, "AGENT", `${m.msg.from}→${m.msg.to}:`, m.msg.text)
            else console.log(t, m.type)
        }
        ws.onclose = e => { console.log("closed", e.code, e.reason, "- reconnecting"); setTimeout(connect, 1000) }
    } catch {
        setTimeout(connect, 1000)
    }
}
connect()
