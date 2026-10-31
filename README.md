# Matchday OS

A personal AI agent for every fan, from one script tag. Any club gets a live, multilingual, AI-run matchday: commentary in each fan's language, "who scores next" picks, answers to questions, and flash merch offers. Behind it, an AI newsroom on Agent Relay, and every fan has their own agent that remembers them.

Data: StatsBomb Open Data (2022 World Cup final, Argentina v France).

## Run it

Requires Bun ≥ 1.4.2 and Node 22/24 (for the local Agent Relay server).

```bash
cp agents/.env.example agents/.env   # add OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
(cd actor && bun install) && (cd agents && bun install)
./scripts/dev.sh          # relay + actor server + gateway (:8080) + agents; logs in .logs/
./scripts/dev.sh stop
```

Run `supabase/schema.sql` once in the Supabase SQL editor (orders, match archive, club inventory).

- Hub: http://localhost:8080/
- Control room: http://localhost:8080/control.html (Space start/pause, G next goal, Shift+R reset, "Add a fan", Leave/Return per phone)
- Club match page with the embed: http://localhost:8080/club.html
- Embed: `<script src="http://HOST:8080/embed.js" data-match="wc22-final" data-lang="sq"></script>` (en, sq, es, ar, ja, fr, de, tr; optional `data-theme="light"`, `data-accent`)
- React Native: [matchos-rn](https://github.com/yasiridriz/matchos-rn) with `EXPO_PUBLIC_WS_URL=ws://<laptop-ip>:8080/ws`

Replay control: `curl -XPOST "localhost:8080/api/control?action=start&value=4000"` (also `pause`, `reset`, `speed&value=ms`, `jump&value=<event index>`). Use **4 s per event** for demos: the agents' time budgets scale with it.

## What fans get

- **Their own agent.** Each connected fan gets a personal agent (an Agent Relay participant, e.g. `fan-sq-3f2a`) whose memory lives in its own `FanAgent` Terse actor: language, picks, questions, purchases, and where they left off. It welcomes them, writes them a personal line at every goal ("you called it"), negotiates a personal offer with club-ops when their pick scores, and catches them up ("While you were away…") when they come back.
- **Live commentary in their language**, written by the commentator, reviewed by the producer, translated together into en/sq/es/ar. A fan in another language (ja, fr, de, tr) makes the producer hire a translator for it, live.
- **Answers** to their questions, grounded in the match data, in their language.
- **Flash offers** on goals, negotiated between merch and club-ops against stock, max discount and allowed bundles.

## The newsroom

All agents talk on Agent Relay's `#match` channel with structured metadata (`to`, `kind`, `ref`, `data`); every message is mirrored into the match actor's log for the control room.

| Agent | Does |
|---|---|
| ingest | Bridges match events, fan arrivals, questions and orders from the actor onto the relay |
| producer | Directs every event (importance, tone, who acts), reviews drafts and may reject once, hires translators, acts on crowd mood |
| commentator | Drafts a line to the directive's tone, rewrites once if rejected |
| translator, translator-xx | sq/es/ar together; hired translators join live as new participants |
| stats | Prep notes, fan answers, quiet-spell nuggets from computed facts, explainers on request |
| merch ↔ club-ops | Negotiate each goal's offer against the club's rules (Supabase `inventory`) |
| crowd | Mood notes per language from votes and questions |
| fan-xx-xxxx | One per fan: welcome, personal goal lines, personal offers, catch-up |

Flags in `agents/.env` (default on; `0` switches one off and falls back to simpler behaviour): `PRODUCER`, `HIRING`, `NEGOTIATION`, `INITIATIVE`, `FAN_AGENTS`. Tuning: `STEP_MS` (800), `REJECT_EVERY` (3), `QUIET_TICKS` (4), `CROWD_MS` (30000), `OPENAI_FAST_MODEL` (gpt-4o-mini).

Goals never wait on the producer, and any step that could delay commentary times out at ~800 ms and falls back. Agents may only state facts from the match data or a fan's own memory.

## Durability (the restart demo)

```bash
./scripts/dev.sh actor                         # kill + restart the Terse actor server
./scripts/dev.sh actor-stop / actor-start      # the same in two steps, to hold the outage on stage
./scripts/restart-test.sh                      # restart, printing the match cursor before and after
```

Fans see "Reconnecting…", reconnect on their own, and everything resumes at the same moment: the match, feeds, offers, stock, the roster of hired agents, and every fan's agent. After editing `actor/src/actors.ts`, restart the actor server fully; alarms stop firing after a hot reload in the local dev server.

## Architecture

```
StatsBomb → data/match.json (62 key events)
                │
  MatchRoom actor (Terse, one per match)          FanAgent actor (Terse, one per fan)
    cursor, score, feeds per language, offers,      language, picks, questions,
    votes, roster, inventory, agent log             purchases, notes, last seen
    replay clock = actor alarm                                │
                │  socket tagged "agents"                     │
  agents/: the newsroom + one agent per fan on Agent Relay ───┘
    core.ts (members, flags, LLM, Supabase), producer.ts, hiring.ts,
    negotiation.ts, initiative.ts, fan-agents.ts, matchday-agents.ts
                │
  gateway/server.ts (:8080): /connect, WebSocket proxy, control API, watchdog, static web/
                │
  web/: embed.js + widget, club match page, control room · React Native app (same contract)
  Supabase: orders, inventory, match archive
```

- `shared/contract.ts` is the message contract shared with the React Native app (only optional fields are ever added). `./scripts/sync-shared.sh` copies it and the data into `actor/src`.
- Terse reserves the `state` socket message type, so the actor sends `room_state` and the gateway renames it.
- `mock/server.ts` is a contract-compatible mock for client development; `scripts/rn-compat.ts <path-to-matchos-rn>` checks the live backend with the RN SDK's own parser.

## Testing and recording

- `./scripts/newsroom-rehearsal.sh`: the full final at demo speed with fans in five languages, a buyer, questions, a Japanese fan joining, and both restarts, scored by `scripts/newsroom-check.ts`.
- `cd demo && npm install && node record.mjs`: records the control-room demo to `demo/out/`.
- `cd demo && node record-story.mjs`: records each fan's surface (Arta, Diego, Kenji on phones; Sam on the club site) and the control room as synced clips, with a beats timeline, to `demo/out/story/`.
