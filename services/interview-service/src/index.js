/**
 * interview-service — interview history CRUD. No AI tokens spent here.
 * Identity: a lightweight anonymous user id supplied by the client header
 * (x-user-id). In production swap for real auth (JWT/OAuth) at the gateway.
 */
import "./env.js";
import express from "express";
import { z } from "zod";
import * as store from "./store.js";
import inviteRoutes from "./invite.routes.js";

const app = express();
app.use(express.json({ limit: "4mb" }));
store.init();
app.use(inviteRoutes);

// IMPORTANT: do NOT fall back to process.env.PORT here — see the comment
// in services/ai-service/src/index.js. Only the gateway should bind to
// Render's injected PORT; this service needs a fixed internal port so it
// doesn't collide with the gateway (or ai-service) when all three run in
// the same container.
const PORT = process.env.INTERVIEW_PORT || 8082;

const userId = req => {
  const id = String(req.headers["x-user-id"] || "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : null;
};

app.get("/health", (_req, res) => res.json({ ok: true, service: "interview-service", maxHistory: store.MAX_HISTORY }));

app.get("/interviews", (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: "Missing or invalid x-user-id" });
  res.json({ interviews: store.list(uid), maxHistory: store.MAX_HISTORY });
});

app.get("/interviews/:id", (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: "Missing or invalid x-user-id" });
  const record = store.get(uid, req.params.id);
  if (!record) return res.status(404).json({ error: "Interview not found" });
  res.json(record);
});

const SaveReq = z.object({
  role: z.string().min(2).max(120),
  level: z.string().max(20),
  candidateName: z.string().max(120),
  transcript: z.array(z.object({
    question: z.string().max(600),
    answer: z.string().max(6000),
    durationSec: z.number().min(0).max(3600).optional()
  })).min(1).max(8),
  evaluation: z.object({
    perAnswer: z.array(z.any()),
    overall: z.object({
      score: z.number(),
      decision: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      summary: z.string()
    })
  })
});

app.post("/interviews", (req, res) => {
  try {
    const uid = userId(req);

    if (!uid) {
      return res.status(401).json({
        error: "Missing or invalid x-user-id"
      });
    }

    const parsed = SaveReq.safeParse(req.body);

    if (!parsed.success) {
      console.error("Validation Error:", parsed.error);

      return res.status(400).json({
        error: parsed.error.issues[0].message
      });
    }

    console.log("Saving Interview...");

    const result = store.save(uid, parsed.data);

    console.log("Saved Successfully");

    return res.status(201).json({
      id: result.record.id,
      removedIds: result.removedIds
    });

  } catch (err) {
    console.error("SAVE ERROR");
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
});

app.delete("/interviews/:id", (req, res) => {
  const uid = userId(req);
  if (!uid) return res.status(401).json({ error: "Missing or invalid x-user-id" });
  const removed = store.remove(uid, req.params.id);
  if (!removed) return res.status(404).json({ error: "Interview not found" });
  res.json({ ok: true });
});

const server = app.listen(PORT, () => console.log(`[interview-service] listening on :${PORT}`));
server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[interview-service] Port ${PORT} is already in use — an old instance is still running. Stop all node processes (or change PORT in .env) and restart.`);
    process.exit(1);
  }
  throw err;
});
