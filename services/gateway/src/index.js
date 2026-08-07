/**
 * gateway — single public entry point.
 *  - Security headers (helmet) + CORS + rate limiting
 *  - Routes /api/ai/* -> ai-service, /api/interviews* -> interview-service
 *  - Serves the built React app in production (frontend/dist)
 */
import "./env.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8081";
const INTERVIEW_URL = process.env.INTERVIEW_SERVICE_URL || "http://localhost:8082";

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false })); // CSP handled at CDN/frontend layer
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));

// Rate limits: generous in development, tight in production, always overridable.
// Keyed per user (x-user-id) when present so one office IP doesn't share a bucket.
const PROD = process.env.NODE_ENV === "production";
const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
const API_LIMIT = num(process.env.RATE_API_PER_MIN, PROD ? 300 : 2000);
const AI_LIMIT = num(process.env.RATE_AI_PER_MIN, PROD ? 30 : 300);
const limiter = (limit, what) =>
  rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => String(req.headers["x-user-id"] || req.ip),
    skip: () => process.env.RATE_LIMIT_DISABLED === "true",
    message: { error: `Too many ${what} requests — wait a minute and try again.` }
  });
app.use("/api/", limiter(API_LIMIT, "API"));
app.use("/api/ai/", limiter(AI_LIMIT, "AI"));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "gateway" }));

// Express strips the mount path, so the proxied URL is already relative to it.
const unreachable = (name, url) => (err, _req, res) => {
  console.error(`[gateway] ${name} unreachable at ${url}: ${err.code || err.message}`);
  if (!res.headersSent) {
    res.status(503).json({
      error: `The ${name} is not reachable at ${url}. Make sure all services are running — start everything with "npm run dev" from the project root, and check the terminal for a crashed service.`
    });
  }
};
app.use("/api/ai", createProxyMiddleware({
  target: AI_URL, changeOrigin: true,
  on: { error: unreachable("ai-service", AI_URL) }
}));
app.use("/api/interviews/invite", createProxyMiddleware({
  target: INTERVIEW_URL,
  changeOrigin: true,
  pathRewrite: p => "/invite" + (p === "/" ? "" : p),
  on: { error: unreachable("interview-service", INTERVIEW_URL) }
}));
app.use("/api/interviews", createProxyMiddleware({
  target: INTERVIEW_URL,
  changeOrigin: true,
  pathRewrite: p => "/interviews" + (p === "/" ? "" : p),
  on: { error: unreachable("interview-service", INTERVIEW_URL) }
}));
app.use("/api/invite", createProxyMiddleware({
  target: INTERVIEW_URL,
  changeOrigin: true,
  pathRewrite: p => "/invite" + (p === "/" ? "" : p),
  on: { error: unreachable("interview-service", INTERVIEW_URL) }
}));
app.use("/api/invites", createProxyMiddleware({
  target: INTERVIEW_URL,
  changeOrigin: true,
  pathRewrite: p => "/invites" + (p === "/" ? "" : p),
  on: { error: unreachable("interview-service", INTERVIEW_URL) }
}));

// static frontend (production build)
const dist = path.resolve(__dirname, "../../../frontend/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(PORT, () => console.log(`[gateway] listening on :${PORT} -> ai:${AI_URL} interviews:${INTERVIEW_URL}`));
server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[gateway] Port ${PORT} is already in use — an old instance is still running. Stop all node processes (or change PORT in .env) and restart.`);
    process.exit(1);
  }
  throw err;
});
