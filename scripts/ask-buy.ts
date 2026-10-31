// Rehearsal helper: a Spanish fan asks a question, votes, and buys the current offer.
const { websocketUrl } = await fetch("http://localhost:8080/connect?userId=tester-es&lang=es").then(r => r.json())
const ws = new WebSocket(websocketUrl)
let offer: any = null
ws.onmessage = e => {
  const m = JSON.parse(String(e.data))
  if (m.type === "state") offer = m.offer
  if (m.type === "offer") offer = m.offer
  if (m.type === "feed" && m.item.kind !== "commentary") console.log("GOT", m.item.kind, m.item.text)
}
ws.onopen = () => {
  ws.send(JSON.stringify({ type: "ask", text: "¿Quién ha marcado hasta ahora?" }))
  ws.send(JSON.stringify({ type: "vote", player: "Messi" }))
  setTimeout(() => { console.log("buying", offer?.title); if (offer) ws.send(JSON.stringify({ type: "buy", offerId: offer.id })) }, 1500)
}
setTimeout(() => process.exit(0), 7000)
