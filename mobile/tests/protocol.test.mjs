import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMessage,
  expiry,
  initialState,
  parseMessage,
  socketUrl,
} from "../src/sdk/protocol.ts";
const feed = (id, minute = 35) => ({
  id,
  minute,
  lang: "sq",
  kind: "commentary",
  text: "Argjentina mban topin.",
});
const snapshot = {
  type: "state",
  score: { home: 1, away: 0 },
  minute: 35,
  feed: [feed("a")],
  offer: null,
  predictions: [{ player: "Lionel Messi", votes: 42 }],
};
test("reconnect replaces every field and removes stale local feed and offer", () => {
  const stale = {
    ...initialState,
    score: { home: 9, away: 9 },
    minute: 120,
    feed: [feed("stale", 120)],
    offer: { id: "old" },
  };
  const recovered = applyMessage(stale, snapshot);
  assert.deepEqual(recovered.score, { home: 1, away: 0 });
  assert.equal(recovered.minute, 35);
  assert.deepEqual(recovered.feed, [feed("a")]);
  assert.equal(recovered.offer, null);
  assert.deepEqual(recovered.predictions, snapshot.predictions);
});
test("feed delivery deduplicates IDs, orders newest first, and bounds memory", () => {
  let state = applyMessage(initialState, snapshot);
  state = applyMessage(state, { type: "feed", item: feed("a", 36) });
  assert.equal(state.feed.length, 1);
  assert.equal(state.feed[0].minute, 36);
  for (let i = 0; i < 240; i++)
    state = applyMessage(state, { type: "feed", item: feed(String(i), i) });
  assert.equal(state.feed.length, 200);
  assert.equal(state.feed[0].id, "239");
});
test("query metadata preserves backend URLs and supports match placeholders", () => {
  const url = new URL(
    socketUrl(
      "wss://club.example/room/{matchId}?token=demo",
      "wc22-final",
      "fan a",
      "sq",
    ),
  );
  assert.equal(url.pathname, "/room/wc22-final");
  assert.equal(url.searchParams.get("token"), "demo");
  assert.equal(url.searchParams.get("userId"), "fan a");
  assert.equal(url.searchParams.get("lang"), "sq");
  assert.equal(url.searchParams.get("matchId"), "wc22-final");
  assert.throws(() => socketUrl("https://club.example", "match", "fan", "en"));
});
test("bad frames cannot corrupt the room; agent traffic is ignored", () => {
  assert.deepEqual(parseMessage(JSON.stringify(snapshot)), snapshot);
  for (const value of [
    "garbage",
    JSON.stringify({ type: "state" }),
    JSON.stringify({ ...snapshot, minute: -1 }),
    JSON.stringify({
      ...snapshot,
      predictions: [{ player: "Messi", votes: "bad" }],
    }),
    JSON.stringify({ ...snapshot, offer: { id: "bad" } }),
    JSON.stringify({ type: "score", home: null, away: 0, minute: 1 }),
    JSON.stringify({ type: "agent", msg: { text: "internal" } }),
  ])
    assert.equal(parseMessage(value), null);
});
test("offer expiration supports epoch milliseconds, seconds, and ISO timestamps", () => {
  const ms = Date.UTC(2026, 9, 31, 19);
  assert.equal(expiry(ms), ms);
  assert.equal(expiry(ms / 1000), ms);
  assert.equal(expiry(new Date(ms).toISOString()), ms);
});
