#!/bin/zsh
# 22 Oct night: the final-PDF Apps Script code, run live from node on my own completed ZZT case (N1), in my key window.
cd "${0:A:h}"
LOG="$PWD/pdf-live.log"
until node -e 'const r=require("./results.json"); process.exit(r.scenarios["N1.8"]?.done ? 0 : 1)'; do sleep 60; done
CASE=$(node -e 'console.log(require("./results.json").scenarios["N1.1"].out.caseId)')
while true; do m=$(date +%M); [ "$m" -ge 31 ] && [ "$m" -le 40 ] && break; sleep 30; done
echo "N1 case $CASE complete; pausing the runner $(date)" >> "$LOG"
pkill -f "loop.sh N"; pkill -f "node run.mjs N"; sleep 2
cd ../final-pdf
echo "--- dry run $(date)" >> "$LOG"; node test/live.mjs "$CASE" >> "$LOG" 2>&1; echo "dry exit $?" >> "$LOG"
echo "--- apply $(date)" >> "$LOG"; node test/live.mjs "$CASE" --apply >> "$LOG" 2>&1; echo "apply exit $?" >> "$LOG"
cd ../night-2026-10-21
echo "--- runner resumes $(date)" >> "$LOG"
./loop.sh N >> runner5.log 2>&1 &
disown
