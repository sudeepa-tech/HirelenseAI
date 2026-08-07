import { getUserId } from "./user.js";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8080";

async function request(path, options = {}) {
  const res = await fetch(API_BASE + "/api" + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-user-id": getUserId(),
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 429) {
      const wait = res.headers.get("retry-after");
      throw new Error(
        `Slow down a moment — too many requests.${
          wait ? ` Try again in ~${wait}s.` : " Try again in under a minute."
        }`
      );
    }

    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export const api = {
  generateQuestions: body => request("/ai/questions", { method: "POST", body: JSON.stringify(body) }),
  evaluate: body => request("/ai/evaluate", { method: "POST", body: JSON.stringify(body) }),
  saveInterview: body => request("/interviews", { method: "POST", body: JSON.stringify(body) }),
  listInterviews: () => request("/interviews"),
  getInterview: id => request("/interviews/" + id),
  deleteInterview: id => request("/interviews/" + id, { method: "DELETE" }),
  createInvite: body => request("/interviews/invite", { method: "POST", body: JSON.stringify(body) }),
  listInvites: () => request("/interviews/invite"),
  getInvite: token => request("/interviews/invite/" + token),
  startInvite: token => request("/interviews/invite/" + token + "/start", { method: "POST" }),
  saveInviteProgress: (token, body) => request("/interviews/invite/" + token + "/progress", { method: "POST", body: JSON.stringify(body) }),
  completeInvite: (token, body) => request("/interviews/invite/" + token + "/finish", { method: "POST", body: JSON.stringify(body) }),
  timeoutInvite: (token, body) => request("/interviews/invite/" + token + "/finish", { method: "POST", body: JSON.stringify(body) })
};
