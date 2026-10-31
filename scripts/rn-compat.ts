// Checks the live gateway against the React Native SDK's own protocol code:
//   bun scripts/rn-compat.ts <path-to-matchos-rn> [lang]
// Every server message must pass the SDK's parseMessage (it silently drops anything else).
const sdkDir = process.argv[2]
const lang = process.argv[3] ?? "sq"
if (!sdkDir) throw new Error("usage: bun scripts/rn-compat.ts <path-to-matchos-rn> [lang]")
const { socketUrl, parseMessage, applyMessage, initialState } = await import(`${sdkDir}/src/sdk/protocol.ts`)

const base = "http://localhost:8080"
const control = (q: string) => fetch(`${base}/api/control?${q}`, { method: "POST" }).then(r => r.json())
const url = socketUrl("ws://localhost:8080/ws", "wc22-final", `rn-test-${lang}`, lang)
console.log("SDK socket URL:", url)

let state = initialState, ok = 0
const rejected: string[] = [], counts: Record<string, number> = {}
const ws = new WebSocket(url)
ws.onmessage = e => {
    const raw = String(e.data), m = parseMessage(raw), type = JSON.parse(raw).type
    if (!m) { if (type !== "agent") rejected.push(raw.slice(0, 160)); return }
    ok++; counts[type] = (counts[type] ?? 0) + 1
    state = applyMessage(state, m)
}
await new Promise(r => (ws.onopen = r))
await control("action=reset")
await control("action=jump&value=19")
await control("action=start&value=3000")
await Bun.sleep(1500)
ws.send(JSON.stringify({ type: "vote", player: "Mbappé" }))
ws.send(JSON.stringify({ type: "ask", text: "Who has scored so far?" }))
await Bun.sleep(9000) // through Mbappé's 80' penalty (offer appears)
if (state.offer) ws.send(JSON.stringify({ type: "buy", offerId: state.offer.id }))
await Bun.sleep(5000)
await control("action=pause")

console.log("accepted by SDK:", ok, counts)
console.log("rejected by SDK:", rejected.length)
for (const r of rejected.slice(0, 5)) console.log("  ", r)
console.log("SDK state:", JSON.stringify({ score: state.score, minute: state.minute, offer: state.offer && { title: state.offer.title, priceEur: state.offer.priceEur }, predictions: state.predictions }))
console.log("feed kinds:", state.feed.map((f: any) => f.kind).join(","))
console.log("last lines:\n " + state.feed.slice(0, 4).map((f: any) => `${f.minute}' [${f.kind}] ${f.text}`).join("\n "))
process.exit(rejected.length ? 1 : 0)
