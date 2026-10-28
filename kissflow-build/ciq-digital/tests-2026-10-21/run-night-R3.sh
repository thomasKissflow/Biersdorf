#!/bin/zsh
# Night 21 → 22 Oct, after A3: R3 leftovers cleaned, R3 open points in full, R3 integrity end. 8 s pacing (agreed with the
# portal session: both at 8 s concurrently), 2-min breaks, stop the chain on any 429/HTML.
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
L="$T/logs"
stopped() { grep -qE "StopError|Paused: |429 Too Many|HTML answer|Stopped on|STOP" "$1"; }
cd "$T" || exit 1
echo "$(date '+%H:%M:%S') cleanup R3"
KF_GAP_MS=8000 node cleanup.mjs --run R3 --apply > "$L/R3-cleanup-night.log" 2>&1; tail -1 "$L/R3-cleanup-night.log"
stopped "$L/R3-cleanup-night.log" && { echo "STOPPED in cleanup"; exit 2; }
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
run() { local label=$1; shift; sleep 120; echo "$(date '+%H:%M:%S') start $label"
  env LIVE=1 RUN=R3 KF_GAP_MS=8000 "$@" > "$L/R3-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end $label exit $? $(grep -o 'Tests  .*' "$L/R3-$label.log" | tail -1)"
  stopped "$L/R3-$label.log" && { echo "STOPPED in $label"; exit 2; }; }
run op-night npx vitest run --config vitest.live.config.ts live/op.live.ts
run integrity-end-night PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
echo "$(date '+%H:%M:%S') R3 night done"
