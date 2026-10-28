#!/bin/zsh
# 22 Oct: swap the running runner for one that honours ./HOLD, in the 12 s pacing gap right after scenario $1 is done
# (the next scenario's first call waits 12 s, so nothing of it has been written yet). Precise process patterns only.
cd "${0:A:h}"
sid="$1"
until node -e 'const r=JSON.parse(require("fs").readFileSync("results.json","utf8"));process.exit(r.scenarios[process.argv[1]]?.done?0:1)' "$sid"; do sleep 1; done
loop=$(pgrep -f "^/bin/zsh ./loop.sh N"); node=$(pgrep -f "^node run.mjs N")
[ -n "$loop" ] && kill $loop; [ -n "$node" ] && kill $node
sleep 2
if pgrep -f "^node run.mjs N" >/dev/null || pgrep -f "^/bin/zsh ./loop.sh N" >/dev/null; then echo "swap: old runner still alive, not restarting"; exit 1; fi
echo "swapped after $sid done ($(date)): restart with the HOLD-aware gate" >> runner5.log
echo "swap done $(date +%T)"
./loop.sh N >> runner5.log 2>&1
echo "night chains exit $? $(date)"
