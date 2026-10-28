#!/bin/zsh
# 22 Oct morning (12 s inside the window; integrity phases dropped after the 06:24 429, list-heavy reads): R3 integrity end (cut short by the 05:13 429), then the R4 showcase with the open points FIRST (the most
# useful items for Thomas), forms, case, R4 integrity end. App window :00-:28 (KF_WINDOW), 8 s, 2-min breaks, stop on 429/HTML.
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
L="$T/logs"
stopped() { grep -qE "StopError|Paused: |429 Too Many|HTML answer|Stopped on" "$1"; }
until [ $(date +%s) -ge $(date -j -f "%H:%M" "06:46" +%s) ]; do sleep 15; done # the 20-min pause after the 06:24 429
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
run() { local r=$1 label=$2; shift 2; echo "$(date '+%H:%M:%S') start $r $label"
  env LIVE=1 RUN=$r KF_WINDOW=0-28 KF_GAP_MS=12000 "$@" > "$L/$r-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end $r $label exit $? $(grep -o 'Tests  .*' "$L/$r-$label.log" | tail -1)"
  stopped "$L/$r-$label.log" && { echo "STOPPED in $r $label"; exit 2; }; sleep 120; }
run R4 op npx vitest run --config vitest.live.config.ts live/op.live.ts
run R4 forms npx vitest run --config vitest.live.config.ts live/forms.live.ts
run R4 case npx vitest run --config vitest.live.config.ts live/case.live.ts
echo "$(date '+%H:%M:%S') night3 done"
