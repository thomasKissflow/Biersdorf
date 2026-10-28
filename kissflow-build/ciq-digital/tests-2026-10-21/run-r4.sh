#!/bin/zsh
# 22 Oct: R4 showcase from a clean start (the partial run stopped at 08:32 is deleted first), open points first, then forms and case.
# App window :00-:28 (KF_WINDOW), 12 s, 2-min breaks, honours HOLD, stops the chain on any 429/HTML.
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
L="$T/logs"
stopped() { grep -qE "StopError|Paused: |429 Too Many|HTML answer|Stopped on" "$1"; }
cd "$T" || exit 1
echo "$(date '+%H:%M:%S') cleanup R4 (partial run)"
KF_WINDOW=0-28 KF_GAP_MS=12000 node cleanup.mjs --run R4 --apply > "$L/R4-cleanup-partial.log" 2>&1; grep -E "^Deleted" "$L/R4-cleanup-partial.log"
stopped "$L/R4-cleanup-partial.log" && { echo "STOPPED in cleanup"; exit 2; }
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
run() { local label=$1; shift; sleep 120; echo "$(date '+%H:%M:%S') start R4 $label"
  env LIVE=1 RUN=R4 KF_WINDOW=0-28 KF_GAP_MS=12000 "$@" > "$L/R4-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end R4 $label exit $? $(grep -o 'Tests  .*' "$L/R4-$label.log" | tail -1)"
  stopped "$L/R4-$label.log" && { echo "STOPPED in R4 $label"; exit 2; }; }
run op npx vitest run --config vitest.live.config.ts live/op.live.ts
run forms npx vitest run --config vitest.live.config.ts live/forms.live.ts
run case npx vitest run --config vitest.live.config.ts live/case.live.ts
echo "$(date '+%H:%M:%S') R4 done"
