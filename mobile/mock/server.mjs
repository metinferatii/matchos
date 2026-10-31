// Synthetic rehearsal fixture, authored for this demo. Not a StatsBomb event replay.
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
const path =
  process.env.MOCK_STATE_FILE ||
  fileURLToPath(new URL("./.state.json", import.meta.url));
const port = Number(process.env.PORT || 8787);
const initial = () => ({
  minute: 35,
  score: { home: 1, away: 0 },
  feed: [
    {
      id: "opening",
      minute: 35,
      kind: "commentary",
      texts: {
        en: "Argentina are finding space down the left. Di María is stretching the French defence.",
        sq: "Argjentina po gjen hapësira në krahun e majtë. Di María po vë në vështirësi mbrojtjen franceze.",
        es: "Argentina encuentra espacios por la izquierda. Di María estira la defensa francesa.",
        ar: "الأرجنتين تجد المساحات على الجهة اليسرى. دي ماريا يضغط على الدفاع الفرنسي.",
      },
    },
  ],
  offer: null,
  predictions: [
    { player: "Lionel Messi", votes: 42 },
    { player: "Kylian Mbappé", votes: 31 },
    { player: "Ángel Di María", votes: 27 },
  ],
  picks: {},
  tick: 0,
});
let state;
try {
  state = JSON.parse(readFileSync(path, "utf8"));
} catch {
  state = initial();
}
function persist() {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, path);
}
function localized(item, lang) {
  const { texts, ...rest } = item;
  return { ...rest, lang, text: texts[lang] || texts.en };
}
function localizedOffer(lang) {
  return state.offer
    ? {
        ...state.offer,
        title: {
          en: "Matchday edition · No. 11",
          sq: "Edicioni i ndeshjes · Nr. 11",
          es: "Edición del partido · N.º 11",
          ar: "إصدار المباراة · رقم ١١",
        }[lang],
      }
    : null;
}
function snapshot(lang) {
  return {
    type: "state",
    score: state.score,
    minute: state.minute,
    feed: state.feed.map((i) => localized(i, lang)),
    offer: localizedOffer(lang),
    predictions: state.predictions,
  };
}
function broadcast(message) {
  for (const ws of wss.clients)
    if (ws.readyState === WebSocket.OPEN)
      ws.send(
        JSON.stringify(typeof message === "function" ? message(ws) : message),
      );
}
function addFeed(kind, texts) {
  const item = {
    id: `event-${Date.now()}-${state.tick}`,
    minute: state.minute,
    kind,
    texts,
  };
  state.feed.unshift(item);
  state.feed = state.feed.slice(0, 100);
  persist();
  broadcast((ws) => ({ type: "feed", item: localized(item, ws.lang) }));
}
function goal() {
  state.minute = 36;
  state.score = { home: 2, away: 0 };
  state.offer = {
    id: `dimaria-${Date.now()}`,
    player: "Ángel Di María",
    title: "Matchday edition · No. 11",
    priceEur: 64,
    discountPct: 20,
    expiresAt: Date.now() + 600000,
  };
  persist();
  broadcast({ type: "score", ...state.score, minute: state.minute });
  addFeed("system", {
    en: "GOAL! Di María finishes a breathtaking Argentina counterattack. 2–0.",
    sq: "GOL! Di María përfundon një kundërsulm të mrekullueshëm të Argjentinës. 2–0.",
    es: "¡GOL! Di María culmina un contragolpe espectacular de Argentina. 2–0.",
    ar: "هدف! دي ماريا ينهي هجمة مرتدة رائعة للأرجنتين. ٢–٠.",
  });
  broadcast((ws) => ({
    type: "offer",
    offer: {
      ...state.offer,
      title: {
        en: "Matchday edition · No. 11",
        sq: "Edicioni i ndeshjes · Nr. 11",
        es: "Edición del partido · N.º 11",
        ar: "إصدار المباراة · رقم ١١",
      }[ws.lang],
    },
  }));
}
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "POST" && req.url === "/demo/goal") {
    goal();
    res.end("Goal sent to all clients");
  } else if (req.method === "POST" && req.url === "/demo/reset") {
    state = initial();
    persist();
    broadcast((ws) => snapshot(ws.lang));
    res.end("Replay reset");
  } else {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        service: "Matchday OS rehearsal mock",
        clients: wss.clients.size,
        minute: state.minute,
        score: state.score,
        synthetic: true,
      }),
    );
  }
});
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  ws.lang = ["en", "sq", "es", "ar"].includes(url.searchParams.get("lang"))
    ? url.searchParams.get("lang")
    : "en";
  ws.userId = url.searchParams.get("userId") || "guest";
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  ws.send(JSON.stringify(snapshot(ws.lang)));
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (
        msg.type === "vote" &&
        state.predictions.some((p) => p.player === msg.player)
      ) {
        const previous = state.picks[ws.userId];
        if (previous === msg.player) return;
        state.predictions = state.predictions.map((p) => ({
          ...p,
          votes: Math.max(
            0,
            p.votes +
              (p.player === msg.player ? 1 : 0) -
              (p.player === previous ? 1 : 0),
          ),
        }));
        state.picks[ws.userId] = msg.player;
        persist();
        broadcast((client) => snapshot(client.lang));
      }
      if (
        msg.type === "ask" &&
        typeof msg.text === "string" &&
        msg.text.trim() &&
        msg.text.length <= 500
      ) {
        const item = {
          id: `answer-${Date.now()}`,
          minute: state.minute,
          kind: "answer",
          texts: {
            en: "Argentina are creating overloads on the left, with Di María receiving in space while Messi draws defenders inside.",
            sq: "Argjentina po krijon epërsi numerike në të majtë. Di María merr topin në hapësirë, ndërsa Messi tërheq mbrojtësit në qendër.",
            es: "Argentina crea superioridad por la izquierda. Di María recibe con espacio mientras Messi atrae a los defensores por dentro.",
            ar: "الأرجنتين تصنع تفوقًا عدديًا على اليسار، حيث يستلم دي ماريا في المساحة بينما يجذب ميسي المدافعين إلى العمق.",
          },
        };
        state.feed.unshift(item);
        state.feed = state.feed.slice(0, 100);
        persist();
        broadcast((client) => ({
          type: "feed",
          item: localized(item, client.lang),
        }));
      }
      if (
        msg.type === "buy" &&
        state.offer?.id === msg.offerId &&
        state.offer.expiresAt > Date.now()
      ) {
        console.info("Purchase request", ws.userId, msg.offerId);
      }
    } catch {
      /* Malformed client messages do not interrupt the shared replay. */
    }
  });
});
const tick = setInterval(
  () => {
    state.tick++;
    if (
      state.tick === 3 &&
      state.score.home === 1 &&
      process.env.MOCK_AUTO_GOAL !== "0"
    )
      goal();
    else if (state.tick % 3 === 0) {
      state.minute = Math.min(120, state.minute + 1);
      persist();
      broadcast({ type: "score", ...state.score, minute: state.minute });
      addFeed("commentary", {
        en: "Argentina keep possession, looking for an opening. France are regrouping.",
        sq: "Argjentina mban topin dhe kërkon hapësira. Franca po riorganizohet.",
        es: "Argentina mantiene la posesión y busca espacios. Francia se reorganiza.",
        ar: "الأرجنتين تحتفظ بالكرة وتبحث عن المساحات. فرنسا تعيد تنظيم صفوفها.",
      });
    } else persist();
  },
  Number(process.env.MOCK_TICK_MS || 6000),
);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
if (process.env.MOCK_NO_LISTEN !== "1") {
  server.listen(port, "0.0.0.0", () =>
    console.info(
      `Matchday mock: ws://localhost:${port}/matches/wc22-final\nPOST /demo/goal or /demo/reset to rehearse. State survives restart.`,
    ),
  );
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
function shutdown() {
  persist();
  clearInterval(tick);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.terminate();
  wss.close();
  if (server.listening) server.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
function stop() {
  shutdown();
  process.exit(0);
}
// Test seam for environments without permission to bind a local socket.
export { wss, goal, shutdown };
