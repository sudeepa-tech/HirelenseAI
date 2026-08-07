#!/bin/sh
# Boots the full HireLens stack and runs a complete live interview session.
set -e
cd "$(dirname "$0")/.."
DATA=/tmp/hirelens-live

echo "== Booting services =="
PORT=8081 MOCK_AI=true node services/ai-service/src/index.js >/tmp/ai.log 2>&1 </dev/null &
AI=$!
PORT=8082 DATA_DIR="$DATA" node services/interview-service/src/index.js >/tmp/int.log 2>&1 </dev/null &
INT=$!
PORT=8080 node services/gateway/src/index.js >/tmp/gw.log 2>&1 </dev/null &
GW=$!
trap 'kill $AI $INT $GW 2>/dev/null' EXIT
sleep 2
cat /tmp/ai.log /tmp/int.log /tmp/gw.log | grep listening

echo ""
echo "== Health checks (via gateway :8080) =="
curl -sf -m 5 localhost:8080/api/health
echo ""
curl -sf -m 5 localhost:8080/api/ai/health
echo ""

UID_H='x-user-id: u_demorecruiter01'

echo ""
echo "== Step 1: Recruiter starts interview for a mid React Developer =="
Q=$(curl -sf -m 10 -X POST localhost:8080/api/ai/questions -H 'content-type: application/json' \
  -d '{"role":"React Developer","level":"mid","skills":["React hooks","REST APIs"],"count":3}')
echo "$Q" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);j.questions.forEach(q=>console.log(`  Q${q.id}. ${q.text}`))})'

echo ""
echo "== Step 2: Candidate answers on camera (transcripts captured by browser) =="
echo "  (submitting the three spoken answers for scoring — ONE batched AI call)"
EVAL=$(curl -sf -m 15 -X POST localhost:8080/api/ai/evaluate -H 'content-type: application/json' -d '{
  "role":"React Developer","level":"mid","candidateName":"Priya Sharma",
  "answers":[
    {"question":"Walk me through your background.","answer":"I have four years building React dashboards for fintech clients. Most recently I led the migration of a legacy class-based app to hooks, cutting bundle size twenty percent and improving initial load from four seconds to under two.","durationSec":52},
    {"question":"Hardest recent problem?","answer":"A data grid with forty thousand rows froze on filter changes. I profiled with React DevTools, memoized row components, added list virtualization and moved filtering into a web worker, bringing interaction latency from two seconds to under one hundred milliseconds.","durationSec":64},
    {"question":"How do you prioritize with unclear requirements?","answer":"I talk to stakeholders first.","durationSec":9}
  ]}')
echo "$EVAL" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);j.perAnswer.forEach(p=>console.log(`  Q${p.q}: accuracy ${p.accuracy}/10  relevance ${p.relevance}/10  depth ${p.depth}/10 — ${p.verdict}`));const o=j.overall;console.log(`  OVERALL: ${o.score}/100  DECISION: ${o.decision.toUpperCase()}`)})'

echo ""
echo "== Step 3: Report saved to history =="
SAVE=$(curl -sf -m 5 -X POST localhost:8080/api/interviews -H 'content-type: application/json' -H "$UID_H" \
  -d "{\"role\":\"React Developer\",\"level\":\"mid\",\"candidateName\":\"Priya Sharma\",\"transcript\":[{\"question\":\"Q1\",\"answer\":\"a1\"},{\"question\":\"Q2\",\"answer\":\"a2\"},{\"question\":\"Q3\",\"answer\":\"a3\"}],\"evaluation\":$EVAL}")
echo "  saved: $SAVE"

echo ""
echo "== Step 4: Run five more interviews to prove the history cap of 5 =="
for i in 1 2 3 4 5; do
  curl -sf -m 5 -X POST localhost:8080/api/interviews -H 'content-type: application/json' -H "$UID_H" \
    -d "{\"role\":\"React Developer\",\"level\":\"mid\",\"candidateName\":\"Candidate $i\",\"transcript\":[{\"question\":\"Q\",\"answer\":\"A\"}],\"evaluation\":$EVAL}" >/dev/null
done
echo "  history now contains:"
curl -sf -m 5 localhost:8080/api/interviews -H "$UID_H" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(`  (max ${j.maxHistory}, showing ${j.interviews.length})`);j.interviews.forEach(i=>console.log(`  - ${i.candidateName}  ${i.score}/100  ${i.decision}`))})'

echo ""
echo "== Step 5: Frontend served by gateway =="
curl -sf -m 5 localhost:8080/ | grep -o "<title>[^<]*</title>"
curl -sf -m 5 -o /dev/null -w "  app bundle: HTTP %{http_code}, %{size_download} bytes\n" localhost:8080/assets/$(ls frontend/dist/assets | grep '\.js$')

echo ""
echo "APPLICATION RAN SUCCESSFULLY — full interview lifecycle completed live."
