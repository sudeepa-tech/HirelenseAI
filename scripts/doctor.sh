#!/bin/sh
# HireLens doctor — diagnoses common setup problems. Run: sh scripts/doctor.sh
cd "$(dirname "$0")/.."
PASS="  [OK]  "
FAIL="  [!!]  "

echo "HireLens doctor"
echo "==============="

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -ge 20 ]; then echo "${PASS}Node.js $(node -v)"; else echo "${FAIL}Node.js 20+ required (found: $(node -v 2>/dev/null || echo 'not installed'))"; fi

if [ -d node_modules ]; then echo "${PASS}Dependencies installed"; else echo "${FAIL}Dependencies missing — run: npm install --ignore-scripts"; fi

if [ -f .env ]; then
  echo "${PASS}.env file exists"
  if grep -q '^MOCK_AI=true' .env; then
    echo "${PASS}MOCK_AI=true — free demo mode, no API key needed"
  elif grep -q '^ANTHROPIC_API_KEY=..*' .env; then
    echo "${PASS}ANTHROPIC_API_KEY is set in .env"
  else
    echo "${FAIL}.env has no ANTHROPIC_API_KEY and MOCK_AI is not true — add one of them, then restart"
  fi
else
  echo "${FAIL}No .env file — run: cp .env.example .env  (then add ANTHROPIC_API_KEY or MOCK_AI=true)"
fi

check_service () {
  NAME=$1; URL=$2
  BODY=$(curl -sf -m 4 "$URL" 2>/dev/null)
  if [ -n "$BODY" ]; then
    echo "${PASS}$NAME running -> $BODY"
  else
    echo "${FAIL}$NAME NOT running at $URL — start everything with: npm run dev"
  fi
}
check_service "gateway           " "http://localhost:8080/api/health"
check_service "ai-service        " "http://localhost:8081/health"
check_service "interview-service " "http://localhost:8082/health"

if curl -sf -m 4 http://localhost:8081/health >/dev/null 2>&1; then
  if curl -sf -m 4 http://localhost:8081/health | grep -q '"configured":true'; then
    echo "${PASS}AI is configured (key present or mock mode)"
  else
    echo "${FAIL}ai-service is running but NOT configured — set ANTHROPIC_API_KEY or MOCK_AI=true in .env and restart"
  fi
  RESP=$(curl -s -m 30 -X POST http://localhost:8081/questions -H 'content-type: application/json' -d '{"role":"Doctor Test","level":"mid","count":3}')
  if echo "$RESP" | grep -q '"questions"'; then
    echo "${PASS}Live question generation works end-to-end"
  else
    echo "${FAIL}Question generation failed: $RESP"
  fi
fi

if [ "$NODE_MAJOR" -ge 20 ] && ! grep -q '^MOCK_AI=true' .env 2>/dev/null; then
  NET=$(node -e 'fetch("https://api.anthropic.com/v1/messages",{method:"POST"}).then(r=>console.log("reachable (HTTP "+r.status+")")).catch(e=>console.log("UNREACHABLE: "+(e.cause&&e.cause.code||e.message)))' 2>/dev/null)
  case "$NET" in
    reachable*) echo "${PASS}api.anthropic.com is $NET" ;;
    *) echo "${FAIL}api.anthropic.com $NET — check internet/VPN/proxy/firewall" ;;
  esac
fi

echo ""
echo "If any [!!] lines appear above, fix them top to bottom, restart 'npm run dev', and re-run this script."
