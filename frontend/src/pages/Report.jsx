import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { videoStore } from "../lib/videoStore.js";

function ScoreDial({ score }) {
  const r = 62, c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--teal)" : score >= 55 ? "#d97706" : "var(--rec)";
  return (
    <div className="dial" role="img" aria-label={`Overall score ${score} out of 100`}>
      <svg width="148" height="148" viewBox="0 0 148 148">
        <circle cx="74" cy="74" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        <circle
          cx="74" cy="74" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * score) / 100}
        />
      </svg>
      <div className="dial-num">
        <div>{score}<small>/ 100</small></div>
      </div>
    </div>
  );
}

const DECISION_LABEL = { hire: "Recommend hire", borderline: "Borderline — second round", no_hire: "Do not hire" };

export function DecisionBadge({ decision }) {
  return <span className={`badge badge-${decision}`}>{DECISION_LABEL[decision] || decision}</span>;
}

export default function Report({ id, navigate }) {
  const [record, setRecord] = useState(null);
  const [videoURL, setVideoURL] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let url;
    (async () => {
      try {
        const rec = await api.getInterview(id);
        setRecord(rec);
        const blob = await videoStore.get(id).catch(() => null);
        if (blob) {
          url = URL.createObjectURL(blob);
          setVideoURL(url);
        }
      } catch (err) {
        setError(err.message);
      }
    })();
    return () => url && URL.revokeObjectURL(url);
  }, [id]);

  if (error) return <div className="empty">{error} <div style={{ marginTop: 14 }}><a className="btn btn-ghost" href="#/history">Go to history</a></div></div>;
  if (!record) return <div className="empty">Loading report…</div>;

  const { evaluation, transcript } = record;
  const o = evaluation.overall;

  return (
    <>
      <div className="report-head">
        <ScoreDial score={o.score} />
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 28, marginBottom: 6 }}>{record.candidateName}</h1>
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>
            {record.level} {record.role} · {new Date(record.createdAt).toLocaleString()} · {transcript.length} questions
          </p>
          <DecisionBadge decision={o.decision} />
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Hiring summary</h2>
        <p>{o.summary}</p>
        <div className="two-col">
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--teal-dark)" }}>Strengths</h3>
            <ul className="list-plain">{o.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 6, color: "var(--rec)" }}>Gaps</h3>
            <ul className="list-plain">{o.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18, overflowX: "auto" }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Answer accuracy</h2>
        <table className="scores">
          <thead>
            <tr><th>#</th><th>Accuracy</th><th>Relevance</th><th>Depth</th><th>Assessment</th></tr>
          </thead>
          <tbody>
            {evaluation.perAnswer.map(p => (
              <tr key={p.q}>
                <td className="num">Q{p.q}</td>
                <td className="num">{p.accuracy}/10</td>
                <td className="num">{p.relevance}/10</td>
                <td className="num">{p.depth}/10</td>
                <td>{p.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Transcript</h2>
        {transcript.map((t, i) => (
          <div className="transcript-item" key={i}>
            <div className="tq">Q{i + 1}. {t.question}</div>
            <div className="ta">{t.answer || "(no answer)"}</div>
          </div>
        ))}
        {videoURL ? (
          <video className="video-replay" src={videoURL} controls />
        ) : (
          <p style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
            Video recording isn't available on this device (recordings are stored in the browser that ran the interview).
          </p>
        )}
      </div>

      <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
        <a className="btn btn-primary" href="#/setup">New interview</a>
        <a className="btn btn-ghost" href="#/history">View history</a>
      </div>
    </>
  );
}
