/**
 * ai-service — the only service that spends AI tokens.
 *
 * Cost design (cheapest tokens, highest quality):
 *  1. Small fast model by default (override with AI_MODEL env).
 *  2. ONE batched evaluation call per interview (never per-answer).
 *  3. Question sets cached in-memory per (role, level, count) for 24h.
 *  4. Compact JSON-only prompts, low max_tokens ceilings.
 *  5. MOCK_AI=true runs the full product with zero API spend (demos/tests).
 */
import "./env.js";
import express from "express";
import { z } from "zod";
import { generateQuestions, evaluateInterview } from "./ai.js";
import { cacheGet, cacheSet } from "./cache.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

// IMPORTANT: do NOT fall back to process.env.PORT here. When all three
// services run in one container (e.g. a single Render web service via
// `npm start` + concurrently), Render injects ONE shared PORT env var.
// If every service tries to bind that same value, only one wins and the
// other two crash with EADDRINUSE — which is what was causing the 502s.
// Only the public-facing gateway should ever read process.env.PORT.
const PORT = process.env.AI_PORT || 8081;

const isConfigured = () => process.env.MOCK_AI === "true" || Boolean(process.env.ANTHROPIC_API_KEY);

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "ai-service", mock: process.env.MOCK_AI === "true", configured: isConfigured() })
);

const QuestionsReq = z.object({
  role: z.string().min(2).max(120),
  level: z.enum(["junior", "mid", "senior", "lead"]).default("mid"),
  skills: z.array(z.string().max(60)).max(10).default([]),
  count: z.number().int().min(3).max(8).default(5),
  language: z.string().max(30).default("English")
});

app.post("/questions", async (req, res) => {
  const parsed = QuestionsReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const q = parsed.data;

  const cacheKey = JSON.stringify([q.role.toLowerCase().trim(), q.level, q.skills.map(s => s.toLowerCase()).sort(), q.count, q.language]);
  const cached = cacheGet(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const result = await generateQuestions(q);
    cacheSet(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (err) {
    console.error("[ai-service] questions failed:", err.message);
    res.status(err.isConfig ? 503 : 502).json({ error: err.isConfig ? err.message : "Question generation failed: " + err.message });
  }
});

const EvaluateReq = z.object({
  role: z.string().min(2).max(120),
  level: z.enum(["junior", "mid", "senior", "lead"]).default("mid"),
  candidateName: z.string().max(120).default("Candidate"),
  answers: z
    .array(
      z.object({
        question: z.string().max(600),
        answer: z.string().max(6000),
        durationSec: z.number().min(0).max(3600).optional()
      })
    )
    .min(1)
    .max(8)
});

app.post("/evaluate", async (req, res) => {
  const parsed = EvaluateReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  try {
    const result = await evaluateInterview(parsed.data);
    res.json(result);
  } catch (err) {
    console.error("[ai-service] evaluate failed:", err.message);
    res.status(err.isConfig ? 503 : 502).json({ error: err.isConfig ? err.message : "Evaluation failed: " + err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[ai-service] listening on :${PORT}`);
  if (process.env.MOCK_AI === "true") {
    console.log("[ai-service] MOCK_AI enabled — no tokens will be spent, scores are simulated.");
  } else if (process.env.ANTHROPIC_API_KEY) {
    console.log(`[ai-service] API key loaded (…${process.env.ANTHROPIC_API_KEY.slice(-4)}), model: ${process.env.AI_MODEL || "claude-haiku-4-5"}`);
  } else {
    console.warn("[ai-service] WARNING: no ANTHROPIC_API_KEY and MOCK_AI is not true — AI requests will fail until .env is configured.");
  }
});
server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[ai-service] Port ${PORT} is already in use — an old instance is still running. Stop all node processes (or change PORT in .env) and restart.`);
    process.exit(1);
  }
  throw err;
});
