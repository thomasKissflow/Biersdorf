#!/bin/zsh
# 22 Oct night: after the displayCopy fix, the final-PDF pipeline for real on my completed case N1, in my key window.
cd "${0:A:h}"
LOG="$PWD/pdf-live.log"; CASE=PkEPW_MFtpCd
while true; do m=$(date +%M); [ "$m" -ge 31 ] && [ "$m" -le 40 ] && break; sleep 30; done
echo "=== second live run (after the displayCopy fix) $(date); pausing the runner" >> "$LOG"
for p in $(pgrep -f "^node run.mjs N"); do kill $p; done; for p in $(pgrep -f "^/bin/zsh ./loop.sh N"); do kill $p; done; sleep 2
ps -eo pid,command | grep -E "^ *[0-9]+ (node run.mjs|/bin/zsh ./loop.sh)" >> "$LOG"
cd ../final-pdf
echo "--- apply $(date)" >> "$LOG"; node test/live.mjs "$CASE" --apply >> "$LOG" 2>&1; echo "apply exit $?" >> "$LOG"
cd ../night-2026-10-21
echo "--- runner resumes $(date)" >> "$LOG"
nohup ./loop.sh N >> runner5.log 2>&1 &
