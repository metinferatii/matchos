# Matchday OS / FK Demo

An Expo TypeScript club app with a drop-in matchday SDK in [`src/sdk`](src/sdk/README.md). New application source written for Haunted Hacks, October 31, 2026.

## Run

Requires Node 22.13+ and an Expo SDK 55-compatible simulator client.

```sh
cd matchday-os
npm install
npx expo install --check
cp .env.example .env
npm run mock
```

In another terminal, from the same directory:

```sh
npm run ios
```

`npm run android` and `npm run web` are also available. Tap **Enter the live room** or the **Matchday** tab. The room starts in Albanian. EN / SQ / ES / AR reconnect with a fresh language-specific snapshot. Change simulator system appearance to check light/dark mode.

For a physical device, replace `localhost` in `.env` with the laptop's LAN IP and keep both devices on the same network. Android emulator uses `10.0.2.2` for the host. Keep Metro's LAN server and mock port 8787 reachable. When using an HTTPS web host, use a `wss://` backend.

Expo native package versions follow the [official SDK 55 compatibility map](https://raw.githubusercontent.com/expo/expo/sdk-55/packages/expo/bundledNativeModules.json).

## Backend handoff

Set `EXPO_PUBLIC_WS_URL` to your teammate's **complete** WebSocket URL and reload the app. A path `{matchId}` placeholder is supported. Metadata is transmitted as `?matchId=wc22-final&userId=…&lang=sq`; confirm this with the teammate. Existing query parameters remain intact. No additional handshake or invented message types.

Assumed nested shapes are `score: { home, away }` and `predictions: [{ player, votes }]`; the brief leaves these unspecified. Details and the exact SDK interface are in [`BACKEND.md`](BACKEND.md).

## Stage rehearsal

The local server is explicitly a **synthetic, multilingual rehearsal fixture**, not a full StatsBomb replay or an AI service. The real backend owns StatsBomb ingestion, AI commentary, match timing, and durable actors. The app includes the requested “Data: StatsBomb Open Data” attribution for that integration.

The mock shares a single room/clock across clients, starts at 35′ / 1–0, and triggers Di María's 36′ goal after 18 seconds. All languages receive the score, localized goal, and the same 10-minute jersey offer. Its answer text is a scripted demonstration; it does not reason over arbitrary questions.

1. Start `MOCK_AUTO_GOAL=0 npm run mock` for a manually triggered stage take (or `npm run mock` for the automatic goal), then connect your three surfaces to the same endpoint and match ID.
2. Select SQ in the simulator, EN on the web client, and ES on the phone.
3. Reset the room if needed, then trigger a goal on demand:
   ```sh
   curl -X POST http://localhost:8787/demo/reset
   curl -X POST http://localhost:8787/demo/goal
   ```
4. Close the offer, make a prediction, ask a question, then reopen the offer and buy. This sends a purchase request and calls the host callback; it does not charge a card.
5. Stop the mock with Ctrl-C. Existing score/feed stay visible, a reconnect banner appears, and actions pause.
6. Run `npm run mock` again. Its atomic `mock/.state.json` checkpoint restores score, feed, offer expiry, and votes. Clients replace their local data from the recovered snapshot. The rehearsal clock pauses during downtime.
7. To reset all connected clients for another take:
   ```sh
   curl -X POST http://localhost:8787/demo/reset
   ```

The mock controls belong on the developer's laptop, outside the fan UI. `GET http://localhost:8787` reports connected-client count and score. Mock HTTP controls have no authentication and are intended only for local rehearsal.

## Checks and current verification limits

```sh
npm run typecheck
npm test
npx expo export --platform ios
```

The tests cover authoritative replacement, duplicate delivery, malformed data, URL metadata, expiration, plus a four-language WebSocket goal/vote/answer/server-restart scenario. The network test explicitly skips when the environment prohibits local listening sockets.

The installed-project TypeScript check and all seven tests pass, including the four-language WebSocket goal/vote/answer/server-restart test, with no skipped tests. The dependency lockfile is included. **Expo export, simulator visual review, native haptics, and keyboard behavior still require verification.** The actual mock/actor URL was not provided in the brief; the default endpoint uses the included local rehearsal server.

## Source map

- `App.tsx` — FK Demo home and tabs; a single SDK integration.
- `src/sdk/MatchdayRoom.tsx` — score, predictions, feed, languages, question composer.
- `src/sdk/useMatchSocket.ts` — identity, lifecycle, reconnect, snapshot gate.
- `src/sdk/protocol.ts` — exact messages, validation, snapshot replacement.
- `src/sdk/OfferSheet.tsx` — animated offer, countdown, buy flow.
- `src/sdk/i18n.ts` — four languages and team labels.
- `mock/server.mjs` — shared synthetic room and durable local checkpoint.
