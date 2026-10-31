#!/bin/sh
# The actor bundle only sees actor/src, so copy the shared contract and data into it.
cd "$(dirname "$0")/.."
cp shared/contract.ts shared/templates.ts actor/src/
cp data/match.json actor/src/match.json
