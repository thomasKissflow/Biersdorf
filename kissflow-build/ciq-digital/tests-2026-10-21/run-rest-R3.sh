#!/bin/zsh
# R3 after the 16:22 429: wait out the pause, clean the case items, then op, forms, integrity end at 4 s with breaks.
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
until [ $(date +%s) -ge $(date -j -f "%H:%M" "16:43" +%s) ]; do sleep 15; done
cd "$T" || exit 1
echo "$(date '+%H:%M:%S') cleanup R3 (case items)"
node cleanup.mjs --run R3 --apply > logs/R3-cleanup-case.log 2>&1; tail -2 logs/R3-cleanup-case.log
grep -qE "429|HTML|Stopped|Paused" logs/R3-cleanup-case.log && { echo "STOPPED in cleanup"; exit 2; }
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
L="$T/logs"
run() { local label=$1; shift; sleep 120; echo "$(date '+%H:%M:%S') start $label"
  env LIVE=1 RUN=R3 KF_GAP_MS=6000 "$@" > "$L/R3-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end $label exit $? $(grep -o 'Tests  .*' "$L/R3-$label.log" | tail -1)"
  if grep -qE "StopError|Paused: |429 Too Many|HTML answer" "$L/R3-$label.log"; then echo "STOPPED in $label"; exit 2; fi; }
run op npx vitest run --config vitest.live.config.ts live/op.live.ts
run forms npx vitest run --config vitest.live.config.ts live/forms.live.ts
run integrity-end PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
echo "$(date '+%H:%M:%S') R3 rest done"
