#!/bin/zsh
# R3 open points again (after the deleted-ledger-id fix), then integrity end; 8 s pacing (agreed with the portal session).
T="/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/kissflow-build/ciq-digital/tests-2026-10-21"
sleep 30
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
L="$T/logs"
run() { local label=$1; shift; echo "$(date '+%H:%M:%S') start $label"
  env LIVE=1 RUN=R3 KF_GAP_MS=8000 "$@" > "$L/R3-$label.log" 2>&1
  echo "$(date '+%H:%M:%S') end $label exit $? $(grep -o 'Tests  .*' "$L/R3-$label.log" | tail -1)"
  if grep -qE "StopError|Paused: |429 Too Many|HTML answer" "$L/R3-$label.log"; then echo "STOPPED in $label"; exit 2; fi; sleep 120; }
run op3 npx vitest run --config vitest.live.config.ts live/op.live.ts
run integrity-end3 PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
echo "$(date '+%H:%M:%S') R3 op + integrity done"
