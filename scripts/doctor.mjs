#!/usr/bin/env node
/** HireLens doctor — cross-platform diagnosis. Run: node scripts/doctor.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ok = m => console.log("  [OK]  " + m);
const bad = m => console.log("  [!!]  " + m);
let problems = 0;
const fail = m => { problems++; bad(m); };

console.log("HireLens doctor\n===============");

const major = Number(process.versions.node.split(".")[0]);
major >= 20 ? ok(`Node.js v${process.versions.node}`) : fail(`Node.js 20+ required (found v${process.versions.node})`);

fs.existsSync(path.join(root, "node_modules"))
  ? ok("Dependencies installed")
  : fail("Dependencies missing — run: npm install --ignore-scripts");

const envPath = path.join(root, ".env");
let mock = false;
if (fs.existsSync(envPath)) {
  ok(".env file exists");
  const env = fs.readFileSync(envPath, "utf8");
  mock = /^MOCK_AI=true/m.test(env);
  if (mock) ok("MOCK_AI=true — free demo mode, no API key needed");
  else if (/^ANTHROPIC_API_KEY=.+/m.test(env)) ok("ANTHROPIC_API_KEY is set in .env");
  else fail(".env has no ANTHROPIC_API_KEY and MOCK_AI is not true — add one, then restart");
} else {
  fail("No .env file — copy .env.example to .env, then add ANTHROPIC_API_KEY or MOCK_AI=true");
}

async function getJSON(url, timeoutMs = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (err) {
    return { error: err.cause?.code || err.name || err.message };
  } finally {
    clearTimeout(t);
  }
}

const services = [
  ["gateway           ", "http://localhost:8080/api/health"],
  ["ai-service        ", "http://localhost:8081/health"],
  ["interview-service ", "http://localhost:8082/health"]
];
let aiUp = false;
for (const [name, url] of services) {
  const r = await getJSON(url);
  if (r.body?.ok) {
    ok(`${name}running -> ${JSON.stringify(r.body)}`);
    if (name.startsWith("ai-service")) aiUp = true;
  } else {
    fail(`${name}NOT running at ${url} (${r.error || "HTTP " + r.status}) — start everything with: npm run dev`);
  }
}

if (aiUp) {
  const health = await getJSON("http://localhost:8081/health");
  health.body?.configured
    ? ok("AI is configured (key present or mock mode)")
    : fail("ai-service is running but NOT configured — set ANTHROPIC_API_KEY or MOCK_AI=true in .env and restart");

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch("http://localhost:8081/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Doctor Test", level: "mid", count: 3 }),
      signal: ctl.signal
    });
    const body = await res.json().catch(() => ({}));
    body.questions ? ok("Live question generation works end-to-end") : fail(`Question generation failed: ${body.error || "HTTP " + res.status}`);
  } catch (err) {
    fail(`Question generation request failed: ${err.cause?.code || err.message}`);
  } finally {
    clearTimeout(t);
  }
}

if (!mock) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST" });
    ok(`api.anthropic.com reachable (HTTP ${res.status})`);
  } catch (err) {
    fail(`api.anthropic.com UNREACHABLE (${err.cause?.code || err.message}) — check internet/VPN/proxy/firewall`);
  }
}

console.log("");
console.log(
  problems === 0
    ? "All checks passed. Open http://localhost:5173 (dev) or http://localhost:8080 (production build)."
    : `${problems} problem(s) found — fix them top to bottom, restart "npm run dev", and run this again.`
);
