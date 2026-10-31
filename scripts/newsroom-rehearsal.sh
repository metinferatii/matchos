#!/bin/bash
# Full newsroom dress rehearsal at demo speed (4s/event): four fans, a buyer, an Albanian fan asking about
# penalties, a Japanese fan joining mid-match (hire), the actor server killed in extra time, then the agents
# process restarted (roster restore). Ends with automatic checks. Logs in .logs/newsroom/.
#   ./scripts/newsroom-rehearsal.sh [path-to-matchos-rn]
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
R=.logs/newsroom; mkdir -p $R; rm -f $R/*.log
RN=${1:-$HOME/Documents/matchos-rn}
api() { curl -s -XPOST "localhost:8080/api/control?action=$1" >/dev/null; }
cursor() { curl -s localhost:8080/api/state | bun -e 'const s=await Bun.stdin.json().catch(()=>({}));console.log(s.cursor??-1)'; }
until_cursor() { while [ "$(cursor)" -lt "$1" ]; do sleep 1; done; }

pkill -f scripts/fan.ts; pkill -f scripts/rehearsal-bots.ts
pkill -f matchday-agents.ts; sleep 0.5
nohup bun agents/matchday-agents.ts > $R/agents-1.log 2>&1 < /dev/null &
sleep 6
for l in en sq es ar; do nohup bun scripts/fan.ts $l > $R/fan-$l.log 2>&1 < /dev/null & done
nohup bun scripts/rehearsal-bots.ts > $R/bots.log 2>&1 < /dev/null &
sleep 2
api reset; sleep 1; api "start&value=4000"
echo "$(date +%T) kick-off"

until_cursor 12; echo "$(date +%T) cursor 12: a Japanese fan joins"
nohup bun scripts/fan.ts ja > $R/fan-ja.log 2>&1 < /dev/null &

until_cursor 44; echo "$(date +%T) cursor 44 (extra time): killing the actor server"
before=$(curl -s localhost:8080/api/state | bun -e 'const s=await Bun.stdin.json();console.log(JSON.stringify({cursor:s.cursor,hired:s.roster.filter(r=>r.hiredBy).map(r=>r.name),stock:Object.fromEntries(Object.values(s.inventory).map(i=>[i.player,i.stock]))}))')
./scripts/dev.sh actor < /dev/null > /dev/null 2>&1
sleep 2
after=$(curl -s localhost:8080/api/state | bun -e 'const s=await Bun.stdin.json();console.log(JSON.stringify({cursor:s.cursor,hired:s.roster.filter(r=>r.hiredBy).map(r=>r.name),stock:Object.fromEntries(Object.values(s.inventory).map(i=>[i.player,i.stock]))}))')
echo "before: $before"; echo "after:  $after"
echo "$before" > $R/restart-before.json; echo "$after" > $R/restart-after.json

until_cursor 48; echo "$(date +%T) cursor 48: restarting the agents process"
pkill -f matchday-agents.ts; sleep 0.5
nohup bun agents/matchday-agents.ts > $R/agents-2.log 2>&1 < /dev/null &

until_cursor 62; echo "$(date +%T) full time"
sleep 10
pkill -f scripts/fan.ts; pkill -f scripts/rehearsal-bots.ts
bun scripts/newsroom-check.ts "$RN"
