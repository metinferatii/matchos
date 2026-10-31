import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
const serverFile = fileURLToPath(
  new URL("../mock/server.mjs", import.meta.url),
);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start(port, path) {
  let errors = "";
  const child = spawn(process.execPath, [serverFile], {
    env: {
      ...process.env,
      PORT: String(port),
      MOCK_STATE_FILE: path,
      MOCK_TICK_MS: "600000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (data) => {
    errors += String(data);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server did not start")),
      5000,
    );
    child.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}: ${errors}`));
    });
  });
  return child;
}
async function stop(child) {
  if (child.exitCode !== null) return;
  const done = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await done;
}
async function connect(port, lang, userId = lang) {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/matches/wc22-final?lang=${lang}&userId=${userId}`,
  );
  const messages = [];
  ws.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await until(() => messages.some((m) => m.type === "state"));
  return { ws, messages };
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error("Timed out waiting for message");
}
test("shared goal, four languages, votes, question, restart, and authoritative recovery", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "matchday-test-"));
  const port = 19000 + Math.floor(Math.random() * 10000);
  let child;
  const clients = [];
  try {
    child = await start(port, join(dir, "state.json"));
    for (const lang of ["en", "sq", "es", "ar"])
      clients.push(await connect(port, lang));
    assert.deepEqual(
      clients.map((c) => c.messages[0].score),
      Array(4).fill({ home: 1, away: 0 }),
    );
    const res = await fetch(`http://127.0.0.1:${port}/demo/goal`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    await until(() =>
      clients.every((c) => c.messages.some((m) => m.type === "offer")),
    );
    for (const [index, c] of clients.entries()) {
      const score = c.messages.find((m) => m.type === "score");
      assert.equal(score.home, 2);
      assert.equal(score.minute, 36);
      const goal = c.messages.find((m) => m.type === "feed");
      assert.equal(goal.item.lang, ["en", "sq", "es", "ar"][index]);
      assert.equal(goal.item.kind, "system");
      assert.ok(
        c.messages.find((m) => m.type === "offer").offer.expiresAt > Date.now(),
      );
    }
    assert.equal(
      new Set(
        clients.map((c) => c.messages.find((m) => m.type === "feed").item.text),
      ).size,
      4,
    );
    clients[1].ws.send(
      JSON.stringify({ type: "vote", player: "Lionel Messi" }),
    );
    await until(() =>
      clients.every(
        (c) => c.messages.filter((m) => m.type === "state").length === 2,
      ),
    );
    assert.equal(clients[0].messages.at(-1).predictions[0].votes, 43);
    clients[1].ws.send(
      JSON.stringify({ type: "vote", player: "Lionel Messi" }),
    );
    await wait(60);
    assert.equal(
      clients[0].messages.filter((m) => m.type === "state").length,
      2,
      "duplicate pick must not inflate counts",
    );
    clients[2].ws.send(JSON.stringify({ type: "ask", text: "Why Argentina?" }));
    await until(() =>
      clients.every((c) =>
        c.messages.some((m) => m.type === "feed" && m.item.kind === "answer"),
      ),
    );
    clients[0].ws.send("{malformed");
    await stop(child);
    await until(() =>
      clients.every((c) => c.ws.readyState === WebSocket.CLOSED),
    );
    child = await start(port, join(dir, "state.json"));
    const recovered = await connect(port, "sq", "sq");
    clients.push(recovered);
    const snapshot = recovered.messages[0];
    assert.equal(snapshot.type, "state");
    assert.deepEqual(snapshot.score, { home: 2, away: 0 });
    assert.equal(snapshot.minute, 36);
    assert.equal(snapshot.predictions[0].votes, 43);
    assert.ok(snapshot.feed.some((i) => i.kind === "answer"));
    assert.ok(snapshot.feed.every((i) => i.lang === "sq"));
    assert.equal(snapshot.offer.player, "Ángel Di María");
    const switched = await connect(port, "ar", "sq");
    clients.push(switched);
    assert.ok(switched.messages[0].feed.every((i) => i.lang === "ar"));
    await fetch(`http://127.0.0.1:${port}/demo/reset`, { method: "POST" });
    await until(() =>
      recovered.messages.some((m) => m.type === "state" && m.score.home === 1),
    );
    assert.equal(recovered.messages.at(-1).offer, null);
  } catch (error) {
    if (String(error).includes("listen EPERM")) {
      t.skip("Workspace sandbox prohibits opening local sockets");
    } else throw error;
  } finally {
    clients.forEach((c) => c.ws.terminate());
    if (child) await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
