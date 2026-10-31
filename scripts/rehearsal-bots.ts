// Rehearsal fans with intent: a Spanish fan who buys every new offer, and an Albanian fan who votes
// and asks about penalties early on (so the crowd agent has something to report).
async function connect(userId: string, lang: string) {
    const { websocketUrl } = await fetch(`http://localhost:8080/connect?userId=${userId}&lang=${lang}`).then(r => r.json())
    const ws = new WebSocket(websocketUrl)
    await new Promise(r => (ws.onopen = r))
    return ws
}

const bought = new Set<string>()
async function buyer() {
    const ws = await connect("bot-buyer-es", "es")
    ws.onmessage = e => {
        const m = JSON.parse(String(e.data))
        const o = m.type === "offer" || m.type === "state" ? m.offer : null
        if (o && !bought.has(o.id)) {
            bought.add(o.id)
            setTimeout(() => { console.log(new Date().toISOString().slice(11, 19), "buy", o.title, o.priceEur); ws.send(JSON.stringify({ type: "buy", offerId: o.id })) }, 1500)
        }
        if (m.type === "feed" && m.item.kind === "system") console.log("system:", m.item.text)
    }
    ws.onclose = () => setTimeout(buyer, 1500)
}

async function asker() {
    const ws = await connect("bot-asker-sq", "sq")
    ws.onmessage = e => {
        const m = JSON.parse(String(e.data))
        if (m.type === "feed" && m.item.kind === "answer") console.log("answer (sq):", m.item.text)
    }
    ws.onclose = () => setTimeout(asker, 1500)
    if (asked) return
    asked = true
    await Bun.sleep(8000)
    ws.send(JSON.stringify({ type: "vote", player: "Messi" }))
    ws.send(JSON.stringify({ type: "ask", text: "Si funksionojnë penalltitë nëse finalja mbaron barazim?" }))
    await Bun.sleep(6000)
    ws.send(JSON.stringify({ type: "ask", text: "Kush gjuan penalltitë për Argjentinën?" }))
}
let asked = false

buyer()
asker()
