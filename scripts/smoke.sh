#!/bin/sh
# End-to-end smoke test: boots all services (mock AI), exercises every endpoint, shuts down.
set -e
cd "$(dirname "$0")/.."
DATA=$(mktemp -d)

PORT=8081 MOCK_AI=true node services/ai-service/src/index.js >/tmp/ai.log 2>&1 </dev/null &
AI=$!
PORT=8082 DATA_DIR="$DATA" node services/interview-service/src/index.js >/tmp/int.log 2>&1 </dev/null &
INT=$!
PORT=8080 node services/gateway/src/index.js >/tmp/gw.log 2>&1 </dev/null &
GW=$!
trap 'kill $AI $INT $GW 2>/dev/null' EXIT
sleep 2

fail() { echo "SMOKE FAIL: $1"; exit 1; }

curl -sf -m 5 localhost:8080/api/health | grep -q '"ok":true' || fail health
curl -sf -m 5 localhost:8080/api/ai/health | grep -q ai-service || fail ai-health

Q=$(curl -sf -m 10 -X POST localhost:8080/api/ai/questions -H 'content-type: application/json' \
  -d '{"role":"React Developer","level":"mid","count":3}')
echo "$Q" | grep -q '"questions"' || fail questions
echo "questions ok: $(echo "$Q" | head -c 140)..."

EVAL=$(curl -sf -m 10 -X POST localhost:8080/api/ai/evaluate -H 'content-type: application/json' \
  -d '{"role":"React Developer","level":"mid","candidateName":"Test C","answers":[{"question":"Q1?","answer":"I built a large dashboard using React hooks, memoization and code splitting to cut load time by forty percent for enterprise users across three regions."},{"question":"Q2?","answer":""}]}')
echo "$EVAL" | grep -q '"decision"' || fail evaluate
echo "evaluate ok: $(echo "$EVAL" | head -c 160)..."

SAVE=$(curl -sf -m 5 -X POST localhost:8080/api/interviews -H 'content-type: application/json' \
  -H 'x-user-id: u_smoketest0001' \
  -d "{\"role\":\"React Developer\",\"level\":\"mid\",\"candidateName\":\"Test C\",\"transcript\":[{\"question\":\"Q1?\",\"answer\":\"ans\"}],\"evaluation\":$EVAL}")
ID=$(echo "$SAVE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
[ -n "$ID" ] || fail save
echo "save ok: id=$ID"

curl -sf -m 5 localhost:8080/api/interviews -H 'x-user-id: u_smoketest0001' | grep -q "$ID" || fail list
curl -sf -m 5 "localhost:8080/api/interviews/$ID" -H 'x-user-id: u_smoketest0001' | grep -q '"transcript"' || fail get
curl -sf -m 5 -X DELETE "localhost:8080/api/interviews/$ID" -H 'x-user-id: u_smoketest0001' | grep -q '"ok":true' || fail delete
curl -s -m 5 localhost:8080/api/interviews | grep -q 'x-user-id' || fail auth-guard
curl -sf -m 5 localhost:8080/ | grep -qi '<!doctype html' || fail frontend
echo "list/get/delete/auth/frontend ok"
echo "ALL SMOKE TESTS PASSED"
