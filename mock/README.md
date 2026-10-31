# Mock match server (for the React Native client)

```bash
bun mock/server.ts                # port 8790, one event every 3s
TICK_MS=1000 bun mock/server.ts   # faster
```

Replays the 2022 World Cup final (62 key events, StatsBomb Open Data) over the real message contract in `shared/contract.ts`, with canned commentary in en/sq/es/ar. It loops after full time.

**Connect** (same handshake as the real backend):

1. `GET http://<laptop-ip>:8790/connect?match=wc22-final&userId=<id>&lang=sq` returns `{ websocketUrl }`
2. Open `websocketUrl`. On connect you get `{type:"state", ...}`, then `score`, `feed`, `offer`, `agent` messages.

From a phone, use the laptop's LAN IP (`ipconfig getifaddr en0`). The server binds 0.0.0.0.

Notes:
- `minute` is a display string like `"45+7'"` or `"PENS"`, not a number.
- `predictions` is `{ [player]: votes }`. The contract has no dedicated predictions message, so after a vote the server re-sends a full `state` to everyone. Treat `state` as a full reset.
- `offer.expiresAt` is epoch ms. `{type:"offer", offer:null}` clears the offer.
- `GET /match.json` serves the full event list (with pitch x/y on a 120x80 StatsBomb pitch).
