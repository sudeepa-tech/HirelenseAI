import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { videoStore } from "../lib/videoStore.js";
import { DecisionBadge } from "./Report.jsx";

export default function History({ navigate }) {
  const [items, setItems] = useState(null);
  const [maxHistory, setMaxHistory] = useState(5);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { interviews, maxHistory: mh } = await api.listInterviews();
      setItems(interviews);
      if (mh) setMaxHistory(mh);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function del(id) {
    if (!window.confirm("Delete this interview and its recording? This can't be undone.")) return;
    try {
      await api.deleteInterview(id);
      await videoStore.remove(id).catch(() => {});
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div className="empty">{error}</div>;
  if (!items) return <div className="empty">Loading history…</div>;

  return (
    <>
      <div className="hero" style={{ marginBottom: 24 }}>
        <div className="eyebrow">Interview history</div>
        <h1 style={{ fontSize: 32 }}>Recent interviews</h1>
        <p>The {maxHistory} most recent interviews are kept — video, transcript and scores. Older ones are removed automatically.</p>
      </div>

      {items.length === 0 ? (
        <div className="card empty">
          No interviews yet.
          <div style={{ marginTop: 16 }}>
            <a className="btn btn-primary" href="#/setup">Run your first interview</a>
          </div>
        </div>
      ) : (
        <div className="hist-list">
          {items.map(it => (
            <div className="hist-row" key={it.id}>
              <div className="meta">
                <div className="who">{it.candidateName}</div>
                <div className="sub">
                  {it.level} {it.role} · {new Date(it.createdAt).toLocaleString()} · {it.questionCount} questions
                </div>
              </div>
              <div className="right">
                {it.score != null && <span className="hist-score">{it.score}/100</span>}
                {it.decision && <DecisionBadge decision={it.decision} />}
                <a className="btn btn-ghost" href={`#/report/${it.id}`}>Open report</a>
                <button className="btn btn-danger" onClick={() => del(it.id)} aria-label={`Delete interview with ${it.candidateName}`}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
