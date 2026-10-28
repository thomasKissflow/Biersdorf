#!/bin/zsh
# One live run, suite after suite (never two at once: one key, one queue). Stops the chain on a StopError (429/HTML) or a
# held pause. Logs to logs/<RUN>-<suite>.log.   ./run-chain.sh R2
RUN=$1; [ -z "$RUN" ] && { echo "usage: run-chain.sh R2|R3"; exit 1; }
cd "/Users/thomas/Documents/Kissflow Projects/POC/Beiersdorf/prototype" || exit 1
L="../kissflow-build/ciq-digital/tests-2026-10-21/logs"
run() { # $1 label, then the env/args
  local label=$1; shift
  echo "$(date '+%H:%M:%S') start $label"
  env LIVE=1 RUN=$RUN KF_GAP_MS=${KF_GAP_MS:-4000} "$@" > "$L/$RUN-$label.log" 2>&1
  local code=$?
  echo "$(date '+%H:%M:%S') end $label exit $code $(grep -o 'Tests  .*' "$L/$RUN-$label.log" | tail -1)"
  if grep -qE "StopError|Paused: |429 Too Many|HTML answer" "$L/$RUN-$label.log"; then echo "STOPPED in $label: no further suites"; exit 2; fi
}
run integrity-start PHASE=start npx vitest run --config vitest.live.config.ts live/integrity.live.ts
run case npx vitest run --config vitest.live.config.ts live/case.live.ts
run op npx vitest run --config vitest.live.config.ts live/op.live.ts
run forms npx vitest run --config vitest.live.config.ts live/forms.live.ts
run integrity-end PHASE=end npx vitest run --config vitest.live.config.ts live/integrity.live.ts
echo "$(date '+%H:%M:%S') chain $RUN done"
