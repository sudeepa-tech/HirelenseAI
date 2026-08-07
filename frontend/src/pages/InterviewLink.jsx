import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

function savePendingSession(invite) {
  if (!invite) return;
  localStorage.setItem("hirelens_pending_invite", JSON.stringify(invite));
}

export default function InterviewLink({ token, navigate, setSession }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const data = await api.getInvite(token);
        if (!ignore) {
          setInvite(data.invite);
          savePendingSession(data.invite);
        }
      } catch (err) {
        if (!ignore) {
          if (err.message === "Interview Link Expired") {
            navigate("/expired");
          } else if (err.message === "Interview Already Completed") {
            navigate("/completed");
          } else {
            setError(err.message);
          }
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [navigate, token]);

  const instructions = useMemo(() => ({
    title: "Interview Instructions",
    bullets: [
      "Use a quiet space with good lighting.",
      "Keep your camera and microphone enabled.",
      "Answer each question clearly and completely.",
      "The interview will auto-submit when the timer reaches zero."
    ]
  }), []);

  async function start() {
    try {
      const { invite: started } = await api.startInvite(token);
      setInvite(started);
      const questions = [
        { text: `Introduce yourself and discuss your experience in ${started.role || "this role"}.` },
        { text: `Describe a challenging problem you solved using ${started.skills?.join(", ") || "your core skills"}.` },
        { text: `Explain how you would approach a production issue in a fast-paced team.` }
      ];
      setSession({
        candidateName: started.candidateName,
        role: started.role,
        level: started.level,
        language: "English",
        asrQuality: "balanced",
        questions,
        answers: [],
        inviteToken: started.token,
        inviteEndTime: started.interviewEndTime || Date.now() + 60 * 60 * 1000
      });
      navigate("/interview");
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}><h2>Preparing interview</h2><p>Checking the invitation link…</p></div>;
  }

  if (error) {
    return <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}><h2>Invitation unavailable</h2><p>{error}</p></div>;
  }

  return (
    <div className="card" style={{ maxWidth: 760, margin: "40px auto" }}>
      <h2>{instructions.title}</h2>
      <p style={{ color: "var(--muted)" }}>
        {invite?.candidateName || "Candidate"}, you are invited to a {invite?.role || "role"} interview.
      </p>
      <ul style={{ margin: "16px 0 20px 18px", lineHeight: 1.7 }}>
        {instructions.bullets.map(b => <li key={b}>{b}</li>)}
      </ul>
      <div className="room-actions">
        <button className="btn btn-primary" onClick={start}>Start Interview</button>
      </div>
    </div>
  );
}
