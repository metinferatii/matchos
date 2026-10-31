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

Notes (the shapes match the RN SDK's `src/sdk/types.ts`):
- `minute` is a number: the minute fans see (23 for 23', 45 for 45+8' so it never goes backwards, 120+ in the shootout). The extra `clock` field has the display text (`"45+8'"`, `"PENS"`).
- `predictions` is `[{ player, votes }]`, most votes first. There is no dedicated predictions message, so after a vote the server re-sends `state` to everyone. Treat `state` as a full reset.
- `offer.priceEur` is the final price. `originalPriceEur` (extra) is the price before `discountPct`. `expiresAt` is epoch ms; `{type:"offer", offer:null}` clears the offer.
- Feed items with `personal: true` (answers, order confirmations) are only for that fan, and are included again in their `state` so a re-sent state doesn't wipe them.
- Socket URL for the SDK: `ws://<laptop-ip>:8790/ws` (mock) or `ws://<laptop-ip>:8080/ws` (real backend). It accepts `matchId`, `userId` and `lang` query params. Port 8787 is the Agent Relay server, not a match socket.
- `GET /match.json` serves the full event list (with pitch x/y on a 120x80 StatsBomb pitch).

Check a client build against the real backend with the SDK's own parser: `bun scripts/rn-compat.ts <path-to-matchos-rn> [lang]`.
