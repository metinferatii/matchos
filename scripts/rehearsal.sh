#!/bin/bash
# Full dress rehearsal: plays the whole final at 4s/event with four fan clients,
# a question, a purchase and an actor-server restart in the middle. Logs in .logs/rehearsal/.
cd "$(dirname "$0")/.."
R=.logs/rehearsal; mkdir -p $R; rm -f $R/*.log
pkill -f scripts/fan.ts
for l in en sq es ar; do nohup bun scripts/fan.ts $l > $R/fan-$l.log 2>&1 < /dev/null & done
sleep 2
curl -s -XPOST "localhost:8080/api/control?action=reset" >/dev/null
curl -s -XPOST "localhost:8080/api/control?action=start&value=4000" >/dev/null
echo "$(date +%T) kick-off"
cursor() { curl -s localhost:8080/api/state | bun -e 'const s=await Bun.stdin.json().catch(()=>({}));console.log(s.cursor??-1)'; }
asked=0; restarted=0
while true; do
    c=$(cursor)
    if [ "$asked" = 0 ] && [ "$c" -ge 22 ]; then
        echo "$(date +%T) cursor $c: fan asks + buys"; bun scripts/ask-buy.ts > $R/askbuy.log 2>&1; asked=1
    fi
    if [ "$restarted" = 0 ] && [ "$c" -ge 30 ]; then
        echo "$(date +%T) cursor $c: killing actor server"; ./scripts/dev.sh actor; restarted=1
        echo "$(date +%T) cursor after restart: $(cursor)"
    fi
    if [ "$c" -ge 62 ]; then echo "$(date +%T) full time"; break; fi
    sleep 2
done
sleep 8
pkill -f scripts/fan.ts
