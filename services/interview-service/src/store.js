/**
 * File-backed interview store. Atomic writes, capped history.
 * Keeps the newest MAX_HISTORY (5) interviews per user; older ones are pruned.
 * Swap this module for Postgres/Mongo in large deployments — the API surface
 * (list/get/save/remove) is the only contract the service depends on.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "interviews.json");
export const MAX_HISTORY = Number(process.env.MAX_HISTORY || 5);

let db = { interviews: [], seq: 0 };

export function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (!Array.isArray(db.interviews)) db = { interviews: [], seq: 0 };
      if (typeof db.seq !== "number") db.seq = db.interviews.length;
    } catch {
      db = { interviews: [], seq: 0 };
    }
  }
}

const byNewest = (a, b) => (b.createdAt - a.createdAt) || (b.seq - a.seq);

function persist() {
  try {
    const tmp = DB_FILE + ".tmp";

    fs.mkdirSync(DATA_DIR, { recursive: true });

    fs.writeFileSync(
      tmp,
      JSON.stringify(db, null, 2),
      "utf8"
    );

    fs.renameSync(tmp, DB_FILE);

    console.log("Database saved:", DB_FILE);

  } catch (err) {
    console.error("Persist Error");
    console.error(err);
    throw err;
  }
}

export function list(userId) {
  return db.interviews
    .filter(i => i.userId === userId)
    .sort(byNewest)
    .map(({ transcript, evaluation, ...meta }) => ({
      ...meta,
      questionCount: transcript?.length || 0,
      score: evaluation?.overall?.score ?? null,
      decision: evaluation?.overall?.decision ?? null
    }));
}

export function get(userId, id) {
  return db.interviews.find(i => i.userId === userId && i.id === id) || null;
}

export function save(userId, payload) {
  const record = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    seq: ++db.seq,
    role: payload.role,
    level: payload.level,
    candidateName: payload.candidateName,
    transcript: payload.transcript,
    evaluation: payload.evaluation
  };
  db.interviews.push(record);

  // prune: keep newest MAX_HISTORY for this user
  const mine = db.interviews.filter(i => i.userId === userId).sort(byNewest);
  const keepIds = new Set(mine.slice(0, MAX_HISTORY).map(i => i.id));
  const removedIds = mine.slice(MAX_HISTORY).map(i => i.id);
  db.interviews = db.interviews.filter(i => i.userId !== userId || keepIds.has(i.id));

  persist();
  return { record, removedIds };
}

export function remove(userId, id) {
  const before = db.interviews.length;
  db.interviews = db.interviews.filter(i => !(i.userId === userId && i.id === id));
  const removed = db.interviews.length !== before;
  if (removed) persist();
  return removed;
}

/** test hook */
export function _reset() {
  db = { interviews: [], seq: 0 };
}
