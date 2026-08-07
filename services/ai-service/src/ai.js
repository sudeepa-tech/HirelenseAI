import { extractJSON } from "./parse.js";

const API_URL = process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5"; // fast + lowest cost tier
const MOCK = process.env.MOCK_AI === "true";

async function callClaude({ system, user, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const err = new Error("AI is not configured. Add ANTHROPIC_API_KEY to the .env file in the project root (get a key at console.anthropic.com), or set MOCK_AI=true to demo without one. Restart after changing .env.");
    err.isConfig = true;
    throw err;
  }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }]
        })
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`Upstream ${res.status}`);
        await new Promise(r => setTimeout(r, attempt * 800));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        console.error(`[ai-service] Claude API ${res.status}: ${body.slice(0, 500)}`);
        const err = new Error(
          res.status === 401 ? "Your ANTHROPIC_API_KEY was rejected (401). Check the key in .env and restart."
          : res.status === 404 ? `Model "${MODEL}" was not found (404). Check AI_MODEL in .env.`
          : `Claude API error ${res.status}. See ai-service logs for details.`
        );
        err.isConfig = res.status === 401 || res.status === 404;
        throw err;
      }
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      return { text, usage: data.usage || {} };
    } catch (err) {
      const code = err?.cause?.code || err?.code;
      if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"].includes(code) || err.message === "fetch failed") {
        lastErr = new Error(`Could not reach the Claude API (${code || "network error"}). Check your internet connection, VPN, proxy, or firewall — the ai-service needs outbound HTTPS access to api.anthropic.com.`);
        lastErr.isConfig = true;
      } else {
        lastErr = err;
      }
      if (attempt === 3) break;
      await new Promise(r => setTimeout(r, attempt * 800));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- questions

export async function generateQuestions({ role, level, skills, count, language }) {
  if (MOCK) return mockQuestions({ role, count });

  const system =
    "You are an expert technical interviewer. Reply with ONLY a JSON object, no markdown, no preamble.";
  const user = [
    `Create ${count} spoken-interview questions for a ${level} ${role}.`,
    skills.length ? `Focus skills: ${skills.join(", ")}.` : "",
    `Language: ${language}.`,
    "Mix: 1 intro/experience, then role-specific depth, 1 behavioral.",
    "Each answerable verbally in 1-2 minutes. No coding-on-paper questions.",
    `Schema: {"questions":[{"id":1,"text":"...","focus":"skill or trait tested","idealPoints":["2-4 short bullet points a strong answer covers"]}]}`
  ]
    .filter(Boolean)
    .join("\n");

  const { text, usage } = await callClaude({ system, user, maxTokens: 1400 });
  const json = extractJSON(text);
  if (!json?.questions?.length) throw new Error("Model returned no questions");
  return {
    questions: json.questions.slice(0, count).map((q, i) => ({
      id: i + 1,
      text: String(q.text || "").trim(),
      focus: String(q.focus || "").trim(),
      idealPoints: Array.isArray(q.idealPoints) ? q.idealPoints.map(String).slice(0, 4) : []
    })),
    usage
  };
}

// ---------------------------------------------------------------- evaluation
// ONE call scores every answer + final decision. This is the biggest cost lever:
// N answers cost roughly the same as 1 because system/context tokens aren't repeated.

export async function evaluateInterview({ role, level, candidateName, answers }) {
  if (MOCK) return mockEvaluation({ answers });

  const system =
    "You are a rigorous, fair hiring evaluator. Judge only what was said; penalize vagueness, reward specifics, examples and correct facts. Detect non-answers, contradictions and likely fabrication. Reply with ONLY a JSON object.";

  const transcript = answers
    .map(
      (a, i) =>
        `Q${i + 1}: ${a.answer && a.answer.trim() ? "" : "(no answer given)"}\n"${a.question}"\nA${i + 1}: "${(a.answer || "").trim() || "—"}"` +
        (a.durationSec ? ` (${Math.round(a.durationSec)}s)` : "")
    )
    .join("\n\n");

  const user = [
    `Role: ${level} ${role}. Candidate: ${candidateName}.`,
    "Score each answer 0-10 for accuracy (factual/technical correctness), relevance, and depth.",
    "Then give an overall 0-100 score and a decision.",
    "Decision rules: hire >= 75, borderline 55-74, no_hire < 55. Unanswered questions score 0.",
    "Transcript:",
    transcript,
    `Schema: {"perAnswer":[{"q":1,"accuracy":0,"relevance":0,"depth":0,"verdict":"one-line why"}],"overall":{"score":0,"decision":"hire|borderline|no_hire","strengths":["..."],"weaknesses":["..."],"summary":"3-4 sentence hiring summary"}}`
  ].join("\n");

  const { text, usage } = await callClaude({ system, user, maxTokens: 1600 });
  const json = extractJSON(text);
  if (!json?.overall) throw new Error("Model returned no evaluation");

  const clamp10 = n => Math.max(0, Math.min(10, Number(n) || 0));
  const perAnswer = (json.perAnswer || []).slice(0, answers.length).map((p, i) => ({
    q: i + 1,
    accuracy: clamp10(p.accuracy),
    relevance: clamp10(p.relevance),
    depth: clamp10(p.depth),
    verdict: String(p.verdict || "").slice(0, 300)
  }));
  const score = Math.max(0, Math.min(100, Math.round(Number(json.overall.score) || 0)));
  const decision = ["hire", "borderline", "no_hire"].includes(json.overall.decision)
    ? json.overall.decision
    : score >= 75 ? "hire" : score >= 55 ? "borderline" : "no_hire";

  return {
    perAnswer,
    overall: {
      score,
      decision,
      strengths: (json.overall.strengths || []).map(String).slice(0, 5),
      weaknesses: (json.overall.weaknesses || []).map(String).slice(0, 5),
      summary: String(json.overall.summary || "").slice(0, 1200)
    },
    usage
  };
}

// ---------------------------------------------------------------- mock mode

function mockQuestions({ role, count }) {
  const base = [
    { text: `Walk me through your background and what draws you to this ${role} position.`, focus: "experience fit" },
    { text: `Describe the most technically challenging problem you solved recently as a ${role}. What made it hard?`, focus: "problem solving" },
    { text: `How do you decide what to build first when requirements are unclear?`, focus: "prioritization" },
    { text: `Explain a core concept of your field as if I were a new junior teammate.`, focus: "communication" },
    { text: `Tell me about a time you disagreed with a teammate. How was it resolved?`, focus: "collaboration" },
    { text: `How do you keep your ${role} skills current? Give a recent example.`, focus: "growth mindset" },
    { text: `What would your first 30 days in this role look like?`, focus: "planning" },
    { text: `Describe a mistake you made at work and what changed afterwards.`, focus: "accountability" }
  ];
  return {
    questions: base.slice(0, count).map((q, i) => ({ id: i + 1, ...q, idealPoints: ["specific example", "clear reasoning", "measurable outcome"] })),
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

function mockEvaluation({ answers }) {
  const perAnswer = answers.map((a, i) => {
    const len = (a.answer || "").trim().split(/\s+/).filter(Boolean).length;
    const s = len === 0 ? 0 : Math.min(10, 3 + Math.round(len / 18));
    return { q: i + 1, accuracy: s, relevance: s, depth: Math.max(0, s - 1), verdict: len === 0 ? "No answer given." : "Mock score based on answer length." };
  });
  const avg = perAnswer.reduce((t, p) => t + p.accuracy + p.relevance + p.depth, 0) / (perAnswer.length * 3);
  const score = Math.round(avg * 10);
  return {
    perAnswer,
    overall: {
      score,
      decision: score >= 75 ? "hire" : score >= 55 ? "borderline" : "no_hire",
      strengths: ["Mock mode: strengths appear here"],
      weaknesses: ["Mock mode: set ANTHROPIC_API_KEY for real evaluation"],
      summary: "Mock evaluation (MOCK_AI=true). Answers were scored by length only. Configure an API key for real AI accuracy detection."
    },
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}
