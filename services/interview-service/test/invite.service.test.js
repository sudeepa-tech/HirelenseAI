process.env.DATA_DIR = "/tmp/hirelens-invite-test-" + Date.now();
const assert = (await import("node:assert")).default;
const { _reset, createInvite, startInvite, saveProgress, completeInvite, getInviteByToken, validateInvite } = await import("../src/invite.service.js");

_reset();

const invite = createInvite({
  candidateName: "Asha Patel",
  candidateEmail: "asha@example.com",
  role: "Frontend Engineer",
  level: "mid",
  skills: ["React", "Testing"],
  interviewDurationMinutes: 60
});

assert.ok(invite.token, "token generated");
assert.equal(invite.status, "PENDING");
assert.equal(invite.interviewDuration, 60);
assert.deepEqual(invite.answers, []);
assert.equal(invite.score, null);

const started = startInvite(invite.token, Date.now());
assert.equal(started.status, "STARTED");
assert.ok(started.interviewEndTime > started.interviewStartTime);

const progressed = saveProgress(invite.token, {
  questionNumber: 1,
  question: "Tell me about yourself",
  answer: "I build user interfaces",
  transcript: [{ question: "Tell me about yourself", answer: "I build user interfaces" }],
  audioPath: "browser://audio/1",
  videoPath: "browser://video/1",
  timestamp: Date.now()
});
assert.equal(progressed.progress.length, 1);
assert.equal(progressed.progress[0].questionNumber, 1);

const completed = completeInvite(invite.token, {
  status: "COMPLETED",
  transcript: [{ question: "Tell me about yourself", answer: "I build user interfaces" }],
  evaluation: { overall: { score: 82, decision: "hire" } },
  score: 82
});
assert.equal(completed.status, "COMPLETED");
assert.ok(completed.completedAt);
assert.equal(completed.score, 82);
assert.ok(getInviteByToken(invite.token));

const missing = validateInvite("missing-token", Date.now());
assert.equal(missing.code, 404);

console.log("invite-service tests passed");
