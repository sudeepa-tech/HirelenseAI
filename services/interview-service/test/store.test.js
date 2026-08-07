process.env.DATA_DIR = "/tmp/hirelens-test-" + Date.now();
const { init, save, list, get, remove, _reset, MAX_HISTORY } = await import("../src/store.js");
const assert = (await import("node:assert")).default;

init(); _reset();
const uid = "user_testtest01";
const payload = i => ({
  role: "Frontend Engineer", level: "mid", candidateName: "Cand " + i,
  transcript: [{ question: "Q?", answer: "A" + i }],
  evaluation: { perAnswer: [], overall: { score: 60 + i, decision: "borderline", strengths: [], weaknesses: [], summary: "s" } }
});

for (let i = 1; i <= 7; i++) save(uid, payload(i));
const mine = list(uid);
assert.equal(mine.length, MAX_HISTORY, "history capped at " + MAX_HISTORY);
assert.equal(mine[0].candidateName, "Cand 7", "newest first");
assert.ok(!mine.find(m => m.candidateName === "Cand 1"), "oldest pruned");

const full = get(uid, mine[0].id);
assert.equal(full.transcript[0].answer, "A7");
assert.equal(list("user_otherother1").length, 0, "user isolation");
assert.ok(remove(uid, mine[0].id));
assert.equal(list(uid).length, MAX_HISTORY - 1);
console.log("interview-service store tests passed");
