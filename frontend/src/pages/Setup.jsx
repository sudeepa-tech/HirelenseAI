import React, { useState } from "react";
import { api } from "../lib/api.js";

export default function Setup({ navigate, setSession }) {
  const [form, setForm] = useState({
    candidateName: "",
    role: "",
    level: "mid",
    skills: "",
    count: 5,
    language: "English",
    asrQuality: "balanced"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function begin(e) {
    e.preventDefault();
    setError(null);
    if (!form.candidateName.trim() || form.role.trim().length < 2) {
      setError("Enter the candidate's name and the role to interview for.");
      return;
    }
    setLoading(true);
    try {
      const skills = form.skills.split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
      const { questions } = await api.generateQuestions({
        role: form.role.trim(),
        level: form.level,
        skills,
        count: Number(form.count),
        language: form.language
      });
      setSession({
        candidateName: form.candidateName.trim(),
        role: form.role.trim(),
        level: form.level,
        language: form.language,
        asrQuality: form.asrQuality,
        questions,
        answers: []
      });
      navigate("/interview");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="hero">
        <div className="eyebrow">AI interviewer · Live scoring</div>
        <h1>Run the interview. Get the decision.</h1>
        <p>
          HireLens asks role-specific questions on camera, transcribes the candidate's
          spoken answers, checks them for accuracy and depth, and returns a
          hire / no-hire recommendation with the full scored transcript.
        </p>
      </div>

      <form className="card" onSubmit={begin}>
        <div className="setup-grid">
          <div className="field">
            <label htmlFor="cand">Candidate name</label>
            <input id="cand" value={form.candidateName} onChange={e => set("candidateName", e.target.value)} placeholder="Priya Sharma" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <input id="role" value={form.role} onChange={e => set("role", e.target.value)} placeholder="React Developer" maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="level">Seniority</label>
            <select id="level" value={form.level} onChange={e => set("level", e.target.value)}>
              <option value="junior">Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="count">Questions</label>
            <select id="count" value={form.count} onChange={e => set("count", e.target.value)}>
              {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field full">
            <label htmlFor="skills">Focus skills <span className="hint">(optional, comma-separated)</span></label>
            <input id="skills" value={form.skills} onChange={e => set("skills", e.target.value)} placeholder="React hooks, REST APIs, testing" />
          </div>
          <div className="field">
            <label htmlFor="lang">Interview language</label>
            <select id="lang" value={form.language} onChange={e => set("language", e.target.value)}>
              {["English", "Hindi", "Spanish", "French", "German", "Portuguese", "Japanese", "Arabic", "Bengali"].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <span className="hint">Questions and speech recognition both use this language.</span>
          </div>
          <div className="field">
            <label htmlFor="asr">Transcription accuracy</label>
            <select id="asr" value={form.asrQuality} onChange={e => set("asrQuality", e.target.value)}>
              <option value="fast">Fast (~40 MB model)</option>
              <option value="balanced">Balanced (~80 MB model)</option>
              <option value="max">Max accuracy (~250 MB model)</option>
            </select>
            <span className="hint">Whisper runs on-device; the model downloads once and is cached.</span>
          </div>
        </div>
        <div style={{ marginTop: 22 }}>
          <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
            {loading ? "Preparing questions…" : "Start interview"}
          </button>
        </div>
        {error && <div className="error-note" role="alert">{error}</div>}
      </form>
    </>
  );
}
