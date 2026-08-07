import React, { useState } from "react";
import { api } from "../lib/api.js";

export default function CreateInterview({ navigate }) {
  const [form, setForm] = useState({
    candidateName: "",
    candidateEmail: "",
    role: "",
    level: "mid",
    skills: "",
    interviewDurationMinutes: 60
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null);
  const [copied, setCopied] = useState(false);

  function setValue(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setCopied(false);
    try {
      const payload = {
        ...form,
        skills: form.skills.split(",").map(v => v.trim()).filter(Boolean)
      };
      const created = await api.createInvite(payload);
      setInvite({ ...created.invite, interviewLink: created.interviewLink });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!invite?.interviewLink) return;
    try {
      await navigator.clipboard.writeText(invite.interviewLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function openLink() {
    if (!invite?.interviewLink) return;
    window.open(invite.interviewLink, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="card" style={{ maxWidth: 760, margin: "32px auto" }}>
      <h2 style={{ marginBottom: 8 }}>Create Interview Link</h2>
      <p style={{ color: "var(--muted)", marginBottom: 20 }}>
        Generate a secure candidate invitation link that opens the interview experience without exposing any database id.
      </p>
      <form onSubmit={submit}>
        <div className="setup-grid">
          <div className="field">
            <label htmlFor="candidateName">Candidate name</label>
            <input id="candidateName" value={form.candidateName} onChange={e => setValue("candidateName", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="candidateEmail">Candidate email</label>
            <input id="candidateEmail" type="email" value={form.candidateEmail} onChange={e => setValue("candidateEmail", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <input id="role" value={form.role} onChange={e => setValue("role", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="level">Level</label>
            <select id="level" value={form.level} onChange={e => setValue("level", e.target.value)}>
              <option value="junior">Junior</option>
              <option value="mid">Mid-level</option>
              <option value="senior">Senior</option>
              <option value="lead">Lead</option>
            </select>
          </div>
          <div className="field full">
            <label htmlFor="skills">Skills</label>
            <input id="skills" value={form.skills} onChange={e => setValue("skills", e.target.value)} placeholder="React, Node.js, SQL" />
          </div>
          <div className="field">
            <label htmlFor="duration">Interview duration (minutes)</label>
            <input id="duration" type="number" min="30" step="15" value={form.interviewDurationMinutes} onChange={e => setValue("interviewDurationMinutes", Number(e.target.value))} />
          </div>
        </div>
        <div className="room-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Creating link…" : "Create interview link"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate("/setup")}>Back</button>
        </div>
        {error && <div className="error-note" role="alert" style={{ marginTop: 14 }}>{error}</div>}
      </form>

      {invite && (
        <div className="card" style={{ marginTop: 24, background: "var(--surface-alt)" }}>
          <h3 style={{ marginBottom: 6 }}>Generated Interview Link</h3>
          <p style={{ marginBottom: 8 }}><strong>Candidate:</strong> {invite.candidateName} ({invite.candidateEmail})</p>
          <p style={{ marginBottom: 8 }}><strong>Role:</strong> {invite.role} · {invite.level}</p>
          <p style={{ marginBottom: 8 }}><strong>Link:</strong> <a href={invite.interviewLink || `/interview/${invite.token}`}>{invite.interviewLink || `/interview/${invite.token}`}</a></p>
          <div className="room-actions" style={{ marginTop: 12, justifyContent: "flex-start" }}>
            <button className="btn btn-primary" type="button" onClick={copyLink}>{copied ? "Copied" : "Copy Link"}</button>
            <button className="btn btn-ghost" type="button" onClick={openLink}>Open Link</button>
          </div>
          <p style={{ color: "var(--muted)", marginTop: 12 }}>This link is valid for 72 hours and will expire automatically after that period.</p>
        </div>
      )}
    </div>
  );
}
