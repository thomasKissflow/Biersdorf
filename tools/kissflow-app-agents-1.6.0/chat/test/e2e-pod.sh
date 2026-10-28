#!/usr/bin/env bash
# e2e-pod.sh — the pod executor, end to end, with zero cluster:
#   dev server (KF_CHAT_EXECUTOR=pod, KF_POD_FAKE=1)  ←HTTP→  a real worker.mjs process
#   whose Conductor drives fake-claude.mjs instead of the CLI.
# Proves: turn queued → worker claims it → events land in the transcript through the SAME sinks →
# the artifact the "build" wrote in the WORKER's sandbox arrives on the SERVER's disk → turn ends.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../../.." && pwd)"
WORK="$(mktemp -d)"; SRV_RUNS="$WORK/server-runs"; WKR_REPO="$WORK/worker-repo"
mkdir -p "$SRV_RUNS" "$WKR_REPO/runs"
PORT=4322
cleanup() { kill "${SRV_PID:-0}" "${WKR_PID:-0}" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

KF_CHAT_EXECUTOR=pod KF_POD_FAKE=1 KF_RUNS_DIR="$SRV_RUNS" PORT=$PORT \
  node "$ROOT/control-plane/dev.mjs" > "$WORK/server.log" 2>&1 & SRV_PID=$!
for i in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/api/apps" && break; sleep 0.5; done

SID=$(curl -sf -X POST "http://localhost:$PORT/api/sessions" -H 'Content-Type: application/json' \
  -d '{"slug":"pod-e2e","name":"Pod E2E"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["session"]["id"])')
curl -sf -o /dev/null -X POST "http://localhost:$PORT/api/sessions/$SID/message" \
  -H 'Content-Type: application/json' -d '{"text":"build me a tiny app"}'

TOKEN=$(python3 -c "import json;print(json.load(open('$SRV_RUNS/.chat/$SID.json'))['workerToken'])")
[ -n "$TOKEN" ] || { echo "FAIL: no worker token minted"; exit 1; }

KF_CP_URL="http://localhost:$PORT" KF_SESSION_ID="$SID" KF_SESSION_SLUG=pod-e2e KF_WORKER_TOKEN="$TOKEN" \
  KF_WORKER_REPO="$WKR_REPO" KF_CHAT_CLAUDE_BIN="$HERE/fake-claude.mjs" KF_POD_IDLE_MS=4000 \
  node "$ROOT/plugins/app-agents/chat/worker.mjs" > "$WORK/worker.log" 2>&1 & WKR_PID=$!

for i in $(seq 1 60); do
  BUSY=$(curl -sf "http://localhost:$PORT/api/sessions/$SID" | python3 -c 'import json,sys;print(json.load(sys.stdin)["session"]["busy"])')
  [ "$BUSY" = "False" ] && break; sleep 0.5
done

python3 - "$SRV_RUNS" "$SID" <<'PYEOF'
import json, sys, os
runs, sid = sys.argv[1], sys.argv[2]
s = json.load(open(f"{runs}/.chat/{sid}.json"))
text = " ".join(m.get("text","") for m in s["messages"] if m["role"] == "assistant")
assert s.get("workerToken"), "worker token not persisted"
assert "Sketching the app" in text, f"assistant prose missing: {text!r}"
assert "<<KF:" not in text, "markers leaked into the transcript"
assert s.get("preview") == "runs/pod-e2e/prototype/index.html", f"preview not adopted: {s.get('preview')!r}"
proto = f"{runs}/pod-e2e/prototype/index.html"
assert os.path.exists(proto), "artifact was NOT shipped to the server"
assert "built by the fake" in open(proto).read(), "artifact content wrong"
print("✔ turn ran in the worker; prose, markers, preview and the artifact all landed on the server")
PYEOF
grep -q "idle — shutting down" "$WORK/worker.log" 2>/dev/null && echo "✔ worker idles out" || { sleep 5; grep -q "idle" "$WORK/worker.log" && echo "✔ worker idles out" || echo "(worker still up — killed by cleanup)"; }
echo "E2E PASS"
