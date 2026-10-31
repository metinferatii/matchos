import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
class Fan extends EventEmitter {
  readyState = 1;
  messages = [];
  send(value) {
    this.messages.push(JSON.parse(value));
  }
  terminate() {
    this.readyState = 3;
    this.server.clients.delete(this);
    this.emit("close");
  }
  ping() {
    this.emit("pong");
  }
}
function joinRoom(room, lang) {
  const fan = new Fan();
  fan.server = room.wss;
  room.wss.clients.add(fan);
  room.wss.emit("connection", fan, {
    url: `/matches/wc22-final?lang=${lang}&userId=${lang}`,
  });
  return fan;
}
test("room handlers localize a shared goal and restore a durable checkpoint", async () => {
  const dir = await mkdtemp(join(tmpdir(), "matchday-room-"));
  process.env.MOCK_STATE_FILE = join(dir, "state.json");
  process.env.MOCK_NO_LISTEN = "1";
  process.env.MOCK_TICK_MS = "600000";
  let room;
  try {
    room = await import(`../mock/server.mjs?first=${Date.now()}`);
    const fans = ["en", "sq", "es", "ar"].map((lang) => joinRoom(room, lang));
    room.goal();
    assert.equal(
      new Set(
        fans.map((f) => f.messages.find((m) => m.type === "feed").item.text),
      ).size,
      4,
    );
    for (const f of fans) {
      assert.equal(f.messages.find((m) => m.type === "score").home, 2);
      assert.equal(f.messages.at(-1).type, "offer");
      assert.ok(f.messages.at(-1).offer.expiresAt > Date.now());
    }
    assert.equal(new Set(fans.map((f) => f.messages.at(-1).offer.id)).size, 1);
    fans[1].emit(
      "message",
      JSON.stringify({ type: "vote", player: "Lionel Messi" }),
    );
    assert.ok(
      fans.every(
        (f) =>
          f.messages.at(-1).type === "state" &&
          f.messages.at(-1).predictions[0].votes === 43,
      ),
    );
    fans[1].emit(
      "message",
      JSON.stringify({ type: "vote", player: "Lionel Messi" }),
    );
    assert.equal(fans[0].messages.at(-1).predictions[0].votes, 43);
    fans[2].emit(
      "message",
      JSON.stringify({ type: "ask", text: "Why Argentina?" }),
    );
    assert.ok(fans.every((f) => f.messages.at(-1).item.kind === "answer"));
    fans[0].emit("message", "{bad-json");
    room.shutdown();
    room = await import(`../mock/server.mjs?restarted=${Date.now()}`);
    const recovered = joinRoom(room, "sq").messages[0];
    assert.deepEqual(recovered.score, { home: 2, away: 0 });
    assert.equal(recovered.minute, 36);
    assert.equal(recovered.predictions[0].votes, 43);
    assert.ok(recovered.feed.every((item) => item.lang === "sq"));
    assert.equal(recovered.feed[0].kind, "answer");
    assert.equal(recovered.offer.player, "Ángel Di María");
    assert.match(recovered.offer.title, /Edicioni/);
  } finally {
    room?.shutdown();
    delete process.env.MOCK_STATE_FILE;
    delete process.env.MOCK_NO_LISTEN;
    delete process.env.MOCK_TICK_MS;
    await rm(dir, { recursive: true, force: true });
  }
});
