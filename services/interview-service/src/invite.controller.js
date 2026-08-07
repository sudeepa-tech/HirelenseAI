
import {
  createInvite,
  getInviteByToken,
  startInvite,
  saveProgress,
  validateInvite,
  completeInvite,
  timeoutInvite,
  listInvites
} from "./invite.service.js";

// The interview link must point at whatever origin the candidate should
// actually open — that's different for local dev (http://localhost:5173),
// production (https://your-app.onrender.com), and any future custom domain.
// Hardcoding one of those as a fallback broke the others, so instead:
//   1. FRONTEND_URL env var always wins if you set it explicitly.
//   2. Otherwise derive it from the request that hit this service
//      (the browser's Origin header, forwarded through the gateway proxy).
//   3. Only fall back to localhost:5173 as a last resort for local dev.
function resolveFrontendUrl(req) {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, "");

  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      // fall through
    }
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"] || req.headers.host;
  if (forwardedHost) return `${forwardedProto || req.protocol || "http"}://${forwardedHost}`;

  return "http://localhost:5173";
}

function buildInterviewLink(token, req) {
  return `${resolveFrontendUrl(req)}/#/interview/${token}`;
}

function publicInvite(invite) {
  if (!invite) return null;
  const { id, ...rest } = invite;
  return rest;
}

export function createInviteHandler(req, res) {
  const { candidateName, candidateEmail, role, level, skills, interviewDurationMinutes } = req.body || {};
  if (!candidateName || !candidateEmail || !role || !level) {
    return res.status(400).json({ error: "candidateName, candidateEmail, role, and level are required" });
  }
  const invite = createInvite({
    candidateName,
    candidateEmail,
    role,
    level,
    skills,
    interviewDurationMinutes
  });
  return res.status(201).json({ success: true, interviewLink: buildInterviewLink(invite.token, req), invite: publicInvite(invite) });
}

export function listInvitesHandler(_req, res) {
  return res.json({ invites: listInvites().map(publicInvite) });
}

export function getInviteByTokenHandler(req, res) {
  const validation = validateInvite(req.params.token);
  if (!validation.ok) {
    return res.status(validation.code).json({ error: validation.message });
  }
  return res.json({ success: true, invite: validation.invite });
}

export function startInviteHandler(req, res) {
  const invite = startInvite(req.params.token);
  if (!invite) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({ success: true, invite: publicInvite(invite) });
}

export function saveProgressHandler(req, res) {
  const invite = saveProgress(req.params.token, req.body);
  if (!invite) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({ success: true, invite: publicInvite(invite) });
}

export function completeInviteHandler(req, res) {
  const invite = completeInvite(req.params.token, req.body);
  if (!invite) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({ success: true, invite: publicInvite(invite) });
}

export function timeoutInviteHandler(req, res) {
  const invite = timeoutInvite(req.params.token, req.body);
  if (!invite) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({ success: true, invite: publicInvite(invite) });
}

export function finishInviteHandler(req, res) {
  const invite = completeInvite(req.params.token, req.body);
  if (!invite) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({ success: true, invite: publicInvite(invite) });
}
