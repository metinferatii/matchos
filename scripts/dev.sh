#!/bin/bash
# Starts the whole stack: Agent Relay server, Terse actor server, gateway (:8080), agents.
#   ./scripts/dev.sh          start everything (logs in .logs/)
#   ./scripts/dev.sh stop     stop everything
#   ./scripts/dev.sh actor    restart only the actor server (the restart demo)
#   ./scripts/dev.sh actor-stop | actor-start   the same in two steps, to hold the outage on stage
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
mkdir -p .logs

stop_actor() { pkill -f "terse actor dev"; pkill -f "durable-actors"; }
start_actor() {
    (cd actor && nohup terse actor dev > ../.logs/actor.log 2>&1 < /dev/null &)
    for i in $(seq 1 30); do sleep 0.5; curl -s localhost:7100 >/dev/null && return; done
    echo "actor server did not come up; see .logs/actor.log"
}

case "${1:-start}" in
stop)
    stop_actor; pkill -f gateway/server.ts; pkill -f matchday-agents.ts; ./agents/start-relay.sh stop
    ;;
actor)
    stop_actor; sleep 1; start_actor; echo "actor server restarted"
    ;;
actor-stop)
    stop_actor; echo "actor server stopped"
    ;;
actor-start)
    start_actor; echo "actor server started"
    ;;
start)
    ./scripts/sync-shared.sh
    ./agents/start-relay.sh > .logs/relay-start.log 2>&1 < /dev/null
    stop_actor; sleep 0.5; start_actor
    pkill -f gateway/server.ts; nohup bun gateway/server.ts > .logs/gateway.log 2>&1 < /dev/null &
    pkill -f matchday-agents.ts; nohup bun agents/matchday-agents.ts > .logs/agents.log 2>&1 < /dev/null &
    sleep 3
    echo "Matchday OS up:"
    echo "  hub           http://localhost:8080/"
    echo "  control room  http://localhost:8080/control.html"
    echo "  club site     http://localhost:8080/club.html"
    echo "  phones        http://$(ipconfig getifaddr en0 2>/dev/null || echo localhost):8080/connect?lang=sq"
    echo "  logs          .logs/{actor,gateway,agents}.log"
    ;;
esac
