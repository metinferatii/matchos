#!/bin/bash
# Kills the actor server mid-match, restarts it, and checks the replay resumes from the same cursor.
cd "$(dirname "$0")/.."
st() { curl -s localhost:8080/api/state | bun -e 'const s=await Bun.stdin.json().catch(()=>({}));console.log(s.score?`cursor ${s.cursor}  ${s.score.home}-${s.score.away}  ${s.minute}  running=${s.running}`:"actor server down")'; }
echo "before kill:   $(st)"
pkill -f "terse actor dev"; pkill -f "durable-actors"; sleep 3
echo "while down:    $(st)"
(cd actor && ~/.bun/bin/terse actor dev > ../.logs/actor.log 2>&1 &)
for i in $(seq 1 20); do sleep 1; curl -s localhost:7100 >/dev/null && break; done
echo "after restart: $(st)"; sleep 4
echo "4s later:      $(st)"
