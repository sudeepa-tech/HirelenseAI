import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "invites.json");

let db = { invites: [] };

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db = { invites: Array.isArray(parsed.invites) ? parsed.invites : [] };
  } catch {
    db = { invites: [] };
  }
}

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function now() {
  return Date.now();
}

function getExpiry(createdAt) {
  return createdAt + 72 * 60 * 60 * 1000;
}

function serializeInvite(invite) {
  if (!invite) return null;
  const { id, ...rest } = invite;
  return rest;
}

export function initInviteStore() {
  ensureStore();
}

export function _reset() {
  db = { invites: [] };
  persist();
}

export function listInvites() {
  return db.invites.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function createInvite(payload) {
  const createdAt = now();
  const interviewDuration = Number(payload.interviewDurationMinutes) || 60;
  const invite = {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    candidateName: payload.candidateName || "",
    candidateEmail: payload.candidateEmail || "",
    role: payload.role || "",
    level: payload.level || "",
    skills: Array.isArray(payload.skills) ? payload.skills : [],
    createdAt,
    expiresAt: getExpiry(createdAt),
    interviewDuration,
    status: "PENDING",
    interviewStartTime: null,
    interviewEndTime: null,
    completedAt: null,
    answers: [],
    progress: [],
    transcript: [],
    evaluation: null,
    score: null
  };
  db.invites.push(invite);
  persist();
  return invite;
}

export function getInviteByToken(token) {
  return db.invites.find(invite => invite.token === token) || null;
}

export function getInviteById(id) {
  return db.invites.find(invite => invite.id === id) || null;
}

export function startInvite(token, startedAt = now()) {
  const invite = getInviteByToken(token);
  if (!invite) return null;
  if (invite.status === "COMPLETED") return invite;
  if (invite.status === "EXPIRED" || invite.status === "TIMEOUT") return invite;
  invite.status = "STARTED";
  invite.interviewStartTime = startedAt;
  invite.interviewEndTime = startedAt + (Number(invite.interviewDuration) || 60) * 60 * 1000;
  persist();
  return invite;
}

export function saveProgress(token, progressEntry) {
  const invite = getInviteByToken(token);
  if (!invite) return null;
  invite.progress = invite.progress || [];
  invite.progress.push(progressEntry);
  invite.answers = Array.isArray(invite.answers) ? invite.answers : [];
  if (progressEntry && typeof progressEntry === "object") {
    invite.answers.push(progressEntry);
  }
  invite.transcript = invite.transcript || [];
  if (Array.isArray(progressEntry?.transcript)) {
    invite.transcript = invite.transcript.concat(progressEntry.transcript);
  }
  persist();
  return invite;
}

export function markExpired(token, nowAt = now()) {
  const invite = getInviteByToken(token);
  if (!invite) return null;
  if (invite.status === "COMPLETED") return invite;
  invite.status = nowAt > (invite.expiresAt || 0) ? "EXPIRED" : invite.status;
  persist();
  return invite;
}

export function completeInvite(token, payload = {}) {
  const invite = getInviteByToken(token);
  if (!invite) return null;
  invite.status = payload.status || "COMPLETED";
  invite.completedAt = payload.completedAt || now();
  invite.transcript = payload.transcript || invite.transcript || [];
  invite.answers = payload.answers || invite.transcript || invite.answers || [];
  invite.evaluation = payload.evaluation || invite.evaluation || null;
  invite.score = payload.score ?? invite.score ?? null;
  persist();
  return invite;
}

export function timeoutInvite(token, payload = {}) {
  const invite = getInviteByToken(token);
  if (!invite) return null;
  invite.status = "TIMEOUT";
  invite.completedAt = payload.completedAt || now();
  invite.transcript = payload.transcript || invite.transcript || [];
  invite.answers = payload.answers || invite.transcript || invite.answers || [];
  invite.evaluation = payload.evaluation || invite.evaluation || null;
  invite.score = payload.score ?? invite.score ?? null;
  persist();
  return invite;
}

export function validateInvite(token, nowAt = now()) {
  const invite = getInviteByToken(token);
  if (!invite) return { ok: false, code: 404, message: "Interview not found" };
  if (nowAt > invite.expiresAt) {
    if (invite.status !== "COMPLETED") {
      invite.status = "EXPIRED";
      persist();
    }
    return { ok: false, code: 410, message: "Interview Link Expired" };
  }
  if (invite.status === "COMPLETED" || invite.status === "TIMEOUT") {
    return { ok: false, code: 409, message: "Interview Already Completed" };
  }
  return { ok: true, invite: serializeInvite(invite) };
}

initInviteStore();
