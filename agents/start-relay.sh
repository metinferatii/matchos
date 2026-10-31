#!/usr/bin/env bash
# Local Agent Relay (Relaycast) server for Matchday OS. No account, no internet
# needed once installed. Does NOT touch Claude Code/Codex configs or ~/.agentworkforce.
#   ./agents/start-relay.sh          start in background (no-op if already up)
#   ./agents/start-relay.sh fg       run in foreground
#   ./agents/start-relay.sh stop     stop the background server
#   ./agents/start-relay.sh reset    stop + delete the local DB (new workspace on next run)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${RELAY_PORT:-8787}"
ENGINE_DIR="$DIR/.relay-engine"
ENTRY="$ENGINE_DIR/node_modules/@relaycast/engine/dist/bin/serve.js"
DATA="$DIR/.relay-data"
PIDFILE="$DATA/engine.pid"
mkdir -p "$DATA"

stop() { [[ -f "$PIDFILE" ]] && kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; }
healthy() { curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; }

case "${1:-start}" in
  stop) stop; echo "stopped"; exit 0 ;;
  reset) stop; rm -f "$DATA"/relaycast.db*; sed -i '' '/^RELAY_/d' "$DIR/.env" 2>/dev/null || true; echo "reset (DB + RELAY_* in .env cleared)"; exit 0 ;;
esac

# Node 22/24 required (better-sqlite3 native module). Bun can't run the engine.
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' \
  || { echo "need Node 22+ on PATH (have $(node -v))"; exit 1; }

if [[ ! -f "$ENTRY" ]]; then
  echo "installing @relaycast/engine@11.1.0 into $ENGINE_DIR ..."
  # better-sqlite3 override: the engine's pinned ^11 has no Node 24 prebuild and fails to compile.
  npm install --prefix "$ENGINE_DIR" --no-audit --no-fund --omit=dev
fi

if healthy; then echo "relay already up on http://127.0.0.1:$PORT"; exit 0; fi

if [[ "${1:-}" == "fg" ]]; then
  exec node "$ENTRY" --db "$DATA/relaycast.db" --port "$PORT"
fi

nohup node "$ENTRY" --db "$DATA/relaycast.db" --port "$PORT" >>"$DATA/engine.log" 2>&1 &
echo $! > "$PIDFILE"
for _ in $(seq 1 40); do healthy && { echo "relay up on http://127.0.0.1:$PORT (pid $(cat "$PIDFILE"), log $DATA/engine.log)"; exit 0; }; sleep 0.25; done
echo "relay failed to start; see $DATA/engine.log"; exit 1
