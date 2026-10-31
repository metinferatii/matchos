# Matchday OS

A drop-in, AI-run matchday team. One script tag and any club gets a live, multilingual, AI-run matchday that sells merch.

Data: StatsBomb Open Data (2022 World Cup final, Argentina v France).

## Run it

Requires Bun ≥ 1.4.2 and Node 22/24 (for the local Agent Relay server).

```bash
./scripts/dev.sh          # relay + actor server + gateway (:8080) + agents; logs in .logs/
./scripts/dev.sh stop
```

- Hub: http://localhost:8080/
- Control room: http://localhost:8080/control.html
- Club site with embed: http://localhost:8080/club.html
- Embed: `<script src="http://HOST:8080/embed.js" data-match="wc22-final" data-lang="sq"></script>`

Replay control: `curl -XPOST "localhost:8080/api/control?action=start&value=4000"` (also `pause`, `reset`, `speed&value=ms`, `jump&value=<event index>`).

Keys live in `agents/.env` (gitignored): `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Run `supabase/schema.sql` once in the Supabase SQL editor.

## The restart demo

```bash
./scripts/dev.sh actor        # kill + restart only the Terse actor server
./scripts/restart-test.sh     # same, printing the cursor before/after
```

Clients drop for a few seconds, reconnect on their own, and the match resumes from the same event. The gateway re-arms the replay alarm if needed.

**After editing `actor/src/actors.ts`, restart the actor server fully** (`./scripts/dev.sh actor`). Alarms stop firing after a hot reload in the local dev server.

## Architecture

```
StatsBomb → data/match.json (62 key events)
                │
  MatchRoom actor (Terse, one per match, keyed by match id)
    persisted: cursor, score, minute, feed per language, agentLog, offer, votes, orders
    replay clock = actor alarm (every tickMs)
                │  socket tagged "agents"
  agents/matchday-agents.ts: five Agent Relay participants
    ingest → #match → commentator → @translator → translator → actor.postCommentary(en, sq, es, ar)
           → #match → merch → actor.setOffer (on goals); orders → Supabase
    ingest → @stats → stats → actor.postAnswer (fan's language)
    every relay message is mirrored to actor.postAgentMsg (control-room chat)
                │
  gateway/server.ts (:8080): /connect handshake, WebSocket proxy to the actor, control API, static web/
                │
  web/ embed.js + widget, club site, control room · React Native app (same contract)
```

- `shared/contract.ts`: the frozen message contract. `./scripts/sync-shared.sh` copies it and the data into `actor/src`.
- `mock/server.ts`: contract-compatible mock for client development (see `mock/README.md`).
- Terse reserves the `state` socket message type, so the actor sends `room_state` and the gateway renames it to `state`. Clients see the contract unchanged.
- Fallbacks: every LLM call has a time budget (a share of the replay tick; 4s for stats answers) with canned multilingual lines, and if the agents process is down, the actor fills in canned commentary on its next tick.

## Demo speed

Use **4s per event** (the control-room default). LLM time budgets scale with the tick: at 4s every line in the dress rehearsal was AI-written in all four languages. At 3s, a few lines per match fall back to canned text when OpenAI is slow. At 2s, most do. Use **Next goal** (G) to skip ahead rather than speeding up.

Full rehearsal: `./scripts/rehearsal.sh` plays the whole final with four fan clients, a question, a purchase and an actor-server restart, and logs to `.logs/rehearsal/`.

## Newsroom (branch `newsroom`)

The agents work as a newsroom on Agent Relay's `#match` channel, with structured metadata (`to`, `kind`, `ref`, `data`) on every message:

| Agent | Does |
|---|---|
| producer | Directs every event (importance, tone, who acts), reviews normal/high drafts and may reject once, hires translators, acts on crowd mood |
| commentator | Drafts a line to the directive's tone, rewrites once if rejected |
| translator, translator-xx | sq/es/ar together; hired translators (ja, fr, de, tr) join live as new relay participants |
| merch ↔ club-ops | Negotiate each goal's flash offer against stock, max discount and bundles (Supabase `inventory`) |
| stats | Prep notes, fan answers, quiet-spell nuggets from computed facts, explainers on request |
| crowd | Mood notes per language from votes and questions |

Each upgrade has a flag in `agents/.env`: `PRODUCER`, `HIRING`, `NEGOTIATION`, `INITIATIVE` (default on; `0` restores the original pipeline). Tuning: `STEP_MS` (800), `REJECT_EVERY` (3), `QUIET_TICKS` (4), `CROWD_MS` (30000), `OPENAI_FAST_MODEL` (gpt-4o-mini).

Goals never wait on the producer, and every agent step that could delay commentary times out at ~800 ms and falls back. The roster, hired agents' feeds and stock live in the actor, so they survive a server restart; a restarted agents process re-hires from the roster.

Full test: `./scripts/newsroom-rehearsal.sh` plays the final at 4s/event with fans in five languages, a buyer, questions, a Japanese fan joining, and both restarts, then scores it with `scripts/newsroom-check.ts`.
