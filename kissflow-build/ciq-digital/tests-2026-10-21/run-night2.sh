#!/bin/zsh
# Night 22 Oct (after the portal-hooks fix in live/lib/world.ts): R3 leftovers, R3 open points, R3 integrity end, then the R4
# showcase (integrity start, forms, case, open points, integrity end). 8 s pacing, 2-min breaks, stop the chain on any 429/HTML.
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
L="$T/logs"
stopped() { grep -qE "StopError|Paused: |429 Too Many|HTML answer|Stopped on" "$1"; }
until [ $(date +%s) -ge $(date -j -f "%H:%M" "01:25" +%s) ]; do sleep 15; done # the 20-min pause after the 01:04 429
cd "$T" || exit 1
echo "$(date '+%H:%M:%S') cleanup R3"
KF_WINDOW=0-28 KF_GAP_MS=8000 node cleanup.mjs --run R3 --apply > "$L/R3-cleanup-night2.log" 2>&1; grep -E "^Deleted" "$L/R3-cleanup-night2.log"
stopped "$L/R3-cleanup-night2.log" && { echo "STOPPED in cleanup"; exit 2; }
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
run() { local r=$1 label=$2; shift 2; sleep 120; echo "$(date '+%H:%M:%S') start $r $label"
  env LIVE=1 RUN=$r KF_WINDOW=0-28 KF_GAP_MS=8000 "$@" > "$L/$r-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end $r $label exit $? $(grep -o 'Tests  .*' "$L/$r-$label.log" | tail -1)"
  stopped "$L/$r-$label.log" && { echo "STOPPED in $r $label"; exit 2; }; }
run R3 op-n2 npx vitest run --config vitest.live.config.ts live/op.live.ts
run R3 integrity-end-n2 PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
run R4 integrity-start PHASE=start npx vitest run --config vitest.live.config.ts live/integrity.live.ts
run R4 forms npx vitest run --config vitest.live.config.ts live/forms.live.ts
run R4 case npx vitest run --config vitest.live.config.ts live/case.live.ts
run R4 op npx vitest run --config vitest.live.config.ts live/op.live.ts
run R4 integrity-end PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
echo "$(date '+%H:%M:%S') night2 done"
