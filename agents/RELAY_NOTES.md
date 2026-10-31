# Agent Relay notes (Matchday OS)

Verified 2026-10-31 with `@agent-relay/sdk@15.0.1`, `@relaycast/engine@11.1.0`, Bun 1.4.4, Node 24.13.

## Start the local server (no account, no wifi)

```bash
./agents/start-relay.sh          # background, http://127.0.0.1:8787 (no-op if already up)
./agents/start-relay.sh fg       # foreground
./agents/start-relay.sh stop
./agents/start-relay.sh reset    # wipe DB + RELAY_* in agents/.env
bun agents/relay-hello.ts        # smoke test, exits 0 on a full round trip
```

The script runs the same server `relay init` would (`@relaycast/engine`, `serve.js --db … --port 8787`), but
installed into `agents/.relay-engine/` with data in `agents/.relay-data/`. We do **not** use `relay init`:
it writes MCP entries into Claude Code/Codex configs and state into `~/.agentworkforce`. Nothing global is touched.
Needs Node 22+ on PATH (Bun can't run the engine). First run does `npm install` (needs internet once).

## Workspace key

`agents/relay.ts` → `ensureWorkspaceKey()`: uses `RELAY_WORKSPACE_KEY` from env or `agents/.env`; if missing it
calls `AgentRelay.createWorkspace({ name: 'matchday', baseUrl })` on the local server and writes the key
(`rk_live_…`) to `agents/.env` (gitignored). Agent tokens (`at_live_…`) are saved there too as
`RELAY_TOKEN_<NAME>`. Bun only auto-loads `.env` from the cwd, so `relay.ts` reads `agents/.env` itself.
Keys survive server restarts (SQLite DB). Fallback to hosted: unset `RELAY_BASE_URL`/use
`AgentRelay.createWorkspace({ name })` with no baseUrl — not needed, local works.

## API that works

```ts
import { AgentRelay } from '@agent-relay/sdk';
import { connectAgent, joinChannel } from './relay';

// connectAgent = new AgentRelay({ workspaceKey, baseUrl: 'http://127.0.0.1:8787' })
//   + relay.workspace.register({ name, type: 'agent' })        (first run; saves agent.token)
//   | relay.workspace.reconnect({ apiToken })                   (later runs)
const { relay, agent } = await connectAgent('translator');
await joinChannel(agent, '#match');           // channels.create({name:'match'}) (ignore exists) + channels.join('match')

relay.addListener('message.created', async ({ message, envelope }) => {
  if (envelope.channel?.name !== 'match') return;
  if (envelope.from?.name === agent.name) return;            // sender = envelope.from.name
  await agent.reply({ messageId: message.messageId, text: '…' });   // thread reply
});
relay.addListener('thread.reply', ({ message, envelope }) => { /* envelope.parent = root msg id */ });
relay.addListener('dm.received',  ({ message, envelope }) => { /* message.conversationId */ });

await agent.sendMessage({ to: '#match', text: 'GOAL!' });      // channel
await agent.sendMessage({ to: '@commentator', text: 'hi' });    // DM
await agent.sendMessage({ to: ['@stats', '@merch'], text: '…' }); // group DM
```

Event objects: `{ type, message, envelope }`. `message`: `messageId, text, from {id,name}, channel {name},
conversationId (DMs), threadId/parentId, createdAt`. `envelope`: `{ from: {id,name}, channel?: {name}, parent? }`.

## Measured (local, 16 runs, 16/16 OK)

- send ack (HTTP): ~11–13 ms
- channel post → other agent's listener: ~15–20 ms
- thread reply → original poster's listener: ~8–12 ms
- full round trip: ~23–33 ms; connect/reconnect 2 agents: ~12–35 ms

## Gotchas

- **Use one `AgentRelay` instance per agent** (all in one process is fine). `relay.addListener` fans in events
  from *every* agent registered on that instance, deduped. With a single shared instance: you DO see your own
  channel posts (echo via the other agents' streams), and a DM event has **no recipient field**
  (`envelope.to` and `message.target` are undefined) so you can't tell which local agent it was for.
  With one instance per agent: no self-echo observed, DMs arrive only at the addressee. Still filter on
  `envelope.from.name !== agent.name` defensively.
- Sender identity is `envelope.from.name` (== `agent.name` == `agent.handle`, no `@`). There is no `from.handle`.
- Registration is **create-only**: registering an existing name → 409 `name_conflict`. Persist the token and
  `workspace.reconnect({ apiToken })` (done in `relay.ts`). After `start-relay.sh reset` the saved key/tokens
  are cleared; if you wipe the DB by hand, also delete `agents/.env`.
- Agents only get channel messages after `channels.join`. Posting to a channel without joining works.
- Channel posts fire `message.created`; replies via `agent.reply()` fire `thread.reply` (not `message.created`);
  DMs fire `dm.received`.
- `AgentRelay` has no `close()`/`disconnect()`; open WebSockets keep the process alive → `process.exit()` in scripts.
- Messages are durable (stored in the DB). Replay-on-reconnect wasn't tested; `relay-hello.ts` tags each run
  with a random id and ignores anything else, do the same if you read the inbox/history.
- `@relaycast/engine@11.1.0` pins `better-sqlite3@^11`, which has no Node 24 prebuild and fails to compile;
  `agents/.relay-engine/package.json` overrides it to `^12.4.1`.
