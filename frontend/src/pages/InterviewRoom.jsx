import React, { useEffect, useRef, useState } from "react";
import { useMediaRecorder } from "../hooks/useMediaRecorder.js";
import { useSpeechToText, speak } from "../hooks/useSpeechToText.js";
import { useWhisper, WHISPER_MODELS } from "../hooks/useWhisper.js";
import { WHISPER_LANG } from "../lib/audio.js";
import { api } from "../lib/api.js";
import { videoStore } from "../lib/videoStore.js";

const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function getInviteStorageKey(token) {
  return `hirelens_invite_state_${token || "default"}`;
}

function readInviteState(token) {
  if (!token) return null;
  try {
    const raw = localStorage.getItem(getInviteStorageKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeInviteState(token, state) {
  if (!token) return;
  try {
    localStorage.setItem(getInviteStorageKey(token), JSON.stringify(state));
  } catch {
    // no-op for storage failures
  }
}

function clearInviteState(token) {
  if (!token) return;
  try {
    localStorage.removeItem(getInviteStorageKey(token));
  } catch {
    // no-op
  }
}

export default function InterviewRoom({ session, setSession, navigate }) {
  const { stream, recording, error: camError, start, stop, teardown, reset, startAnswerAudio, stopAnswerAudio } = useMediaRecorder();
  const stt = useSpeechToText();
  const whisper = useWhisper();
  const videoRef = useRef(null);

  const inviteToken = session?.inviteToken || null;
  const resumeState = inviteToken ? readInviteState(inviteToken) : null;
  const [phase, setPhase] = useState(resumeState?.phase || "lobby"); // lobby | asking | answering | transcribing | reviewing | finishing
  const [qIndex, setQIndex] = useState(resumeState?.qIndex ?? 0);
  const [answers, setAnswers] = useState(resumeState?.answers || []);
  const [draft, setDraft] = useState(resumeState?.draft || "");
  const [reAnswerCount, setReAnswerCount] = useState(0);
  const [asrNote, setAsrNote] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [answerStart, setAnswerStart] = useState(null);
  const [error, setError] = useState(null);
  const [recordingStarted, setRecordingStarted] = useState(false);
  const [timerEndsAt, setTimerEndsAt] = useState(resumeState?.timerEndsAt ?? session?.inviteEndTime ?? null);
  const [remainingMs, setRemainingMs] = useState(resumeState?.remainingMs ?? (session?.inviteEndTime ? Math.max(0, session.inviteEndTime - Date.now()) : null));

  const questions = session?.questions || [];
  const q = questions[qIndex] || { text: "Interview complete" };
  const whisperModel = WHISPER_MODELS[session?.asrQuality || "fast"];
  const whisperLang = WHISPER_LANG[session?.language] || null;

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    if (phase === "answering" && stt.supported) setDraft(stt.transcript);
  }, [stt.transcript, phase, stt.supported]);

  useEffect(() => {
    if (!session || !setSession) return;
    setSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        answers,
        currentQuestionIndex: qIndex,
        inviteToken,
        inviteEndTime: timerEndsAt
      };
    });
  }, [answers, qIndex, timerEndsAt, inviteToken, session, setSession]);

  useEffect(() => {
    if (!inviteToken) return;
    writeInviteState(inviteToken, { phase, qIndex, answers, draft, timerEndsAt, remainingMs });
  }, [answers, draft, inviteToken, phase, qIndex, remainingMs, timerEndsAt]);

  useEffect(() => {
    if (!timerEndsAt || !inviteToken) return;
    const tick = () => {
      const nextRemaining = Math.max(0, timerEndsAt - Date.now());
      setRemainingMs(nextRemaining);
      if (nextRemaining <= 0) {
        handleTimerExpire();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [inviteToken, timerEndsAt]);

  useEffect(() => {
    if (session?.inviteEndTime && !timerEndsAt) {
      const endTime = session.inviteEndTime;
      setTimerEndsAt(endTime);
      setRemainingMs(Math.max(0, endTime - Date.now()));
    }
  }, [session?.inviteEndTime, timerEndsAt]);

  async function beginInterview() {
    setError(null);
    setRecordingStarted(false);
    setPhase("recording");
    stt.stop();
    stt.reset();
    const ok = await start();
    if (!ok) {
      setPhase("lobby");
      setError(camError || "Camera and microphone access could not be established.");
      return;
    }
    setRecordingStarted(true);
    const endTime = session?.inviteEndTime || Date.now() + 60 * 60 * 1000;
    setTimerEndsAt(endTime);
    setRemainingMs(Math.max(0, endTime - Date.now()));
    whisper.load(whisperModel.id).catch(() => {});
    setPhase("asking");
    speak(questions[0].text);
  }

  async function retryInterviewSetup() {
    setError(null);
    setRecordingStarted(false);
    setPhase("recording");
    teardown();
    stt.stop();
    stt.reset();
    const ok = await start();
    if (!ok) {
      setPhase("lobby");
      setError(camError || "Camera and microphone access could not be established.");
      return;
    }
    setRecordingStarted(true);
    const endTime = session?.inviteEndTime || Date.now() + 60 * 60 * 1000;
    setTimerEndsAt(endTime);
    setRemainingMs(Math.max(0, endTime - Date.now()));
    whisper.load(whisperModel.id).catch(() => {});
    setPhase("asking");
    speak(questions[0].text);
  }

  function beginAnswer() {
    setAnswerStart(Date.now());
    setDraft("");
    setAsrNote(null);
    stt.reset();
    if (stt.supported) stt.start();
    startAnswerAudio();
    setPhase("answering");
  }

  async function finishAnswer() {
    const live = stt.supported ? stt.stop() : "";
    const typed = draft.trim();
    const audioBlob = await stopAnswerAudio();
    const fallback = (live || typed).trim();

    setDraft(fallback);
    setPhase("reviewing");

    if (!audioBlob || audioBlob.size < 2000) {
      if (!fallback) {
        setAsrNote("No audio captured. Type the answer or re-answer.");
      }
      return;
    }

    if (whisper.status !== "ready") {
      whisper.load(whisperModel.id).catch(console.error);
    }

    whisper
      .transcribe(audioBlob, whisperLang)
      .then((text) => {
        if (!text) {
          if (fallback) {
            setAsrNote("Using live speech recognition transcript.");
          } else {
            setAsrNote("No speech detected.");
          }
          return;
        }
        setDraft(text);
        setAsrNote(`Transcript improved using Whisper (${whisperModel.label}).`);
      })
      .catch((err) => {
        console.error(err);
        if (fallback) {
          setAsrNote("Whisper unavailable. Using live speech recognition transcript.");
        } else {
          setAsrNote("Unable to transcribe. Please type your answer.");
        }
      });
  }

  async function saveCurrentProgress(entry) {
    if (!inviteToken) return;
    try {
      await api.saveInviteProgress(inviteToken, {
        questionNumber: qIndex + 1,
        question: q.text,
        answer: entry.answer,
        transcript: [entry],
        audioPath: `browser://audio/${inviteToken}/${qIndex + 1}`,
        videoPath: `browser://video/${inviteToken}/${qIndex + 1}`,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function commitAnswer() {
    if (!recordingStarted) {
      setError("Interview cannot continue because recording never started.");
      setPhase("lobby");
      return;
    }
    const durationSec = answerStart ? Math.round((Date.now() - answerStart) / 1000) : 0;
    const entry = { question: q.text, answer: draft.trim(), durationSec };
    const next = [...answers, entry];
    setAnswers(next);
    setDraft("");
    stt.reset();
    await saveCurrentProgress(entry);
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
      setReAnswerCount(0);
      setPhase("asking");
      speak(questions[qIndex + 1].text);
    } else {
      await finishInterview(next);
    }
  }

  async function finishInterview(finalAnswers, reason = "COMPLETED") {
    if (!recordingStarted) {
      setError("Interview cannot continue because recording never started.");
      setPhase("lobby");
      return;
    }
    setPhase("finishing");
    setError(null);
    window.speechSynthesis?.cancel();
    try {
      const blob = await stop();
      teardown();

      const evaluation = await api.evaluate({
        role: session.role,
        level: session.level,
        candidateName: session.candidateName,
        answers: finalAnswers
      });

      const { id, removedIds } = await api.saveInterview({
        role: session.role,
        level: session.level,
        candidateName: session.candidateName,
        transcript: finalAnswers,
        evaluation: { perAnswer: evaluation.perAnswer, overall: evaluation.overall }
      });

      if (inviteToken) {
        try {
          const payload = {
            status: reason === "TIMEOUT" ? "TIMEOUT" : "COMPLETED",
            transcript: finalAnswers,
            evaluation: { perAnswer: evaluation.perAnswer, overall: evaluation.overall }
          };
          if (reason === "TIMEOUT") {
            await api.timeoutInvite(inviteToken, payload);
          } else {
            await api.completeInvite(inviteToken, payload);
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (blob) await videoStore.save(id, blob).catch(() => {});
      if (removedIds?.length) await videoStore.removeMany(removedIds).catch(() => {});

      clearInviteState(inviteToken);
      setSession(null);
      navigate("/report/" + id);
    } catch (err) {
      setError(err.message);
      setPhase("reviewing");
    }
  }

  async function handleTimerExpire() {
    if (phase === "finishing") return;
    if (!recordingStarted) {
      setError("Interview cannot continue because recording never started.");
      setPhase("lobby");
      stt.stop();
      teardown();
      return;
    }
    const currentEntry = draft.trim() ? { question: q.text, answer: draft.trim(), durationSec: answerStart ? Math.round((Date.now() - answerStart) / 1000) : 0 } : null;
    const pendingAnswers = currentEntry ? [...answers, currentEntry] : answers;
    setAnswers(pendingAnswers);
    if (currentEntry) {
      await saveCurrentProgress(currentEntry);
    }
    stt.stop();
    await finishInterview(pendingAnswers, "TIMEOUT");
  }

  function abandon() {
    window.speechSynthesis?.cancel();
    stt.stop();
    teardown();
    clearInviteState(inviteToken);
    setSession(null);
    navigate("/setup");
  }

  const whisperStatusLine =
    whisper.status === "loading"
      ? `Downloading speech model… ${whisper.progress}% (one-time, cached after)`
      : whisper.status === "ready"
        ? null
        : whisper.status === "error"
          ? "Speech model unavailable — live captions/typing will be used."
          : null;

  const timerText = remainingMs == null ? "--:--:--" : fmt(Math.max(0, Math.floor(remainingMs / 1000)));

  if (phase === "lobby") {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center", padding: 40 }}>
        <h2 style={{ fontSize: 26, marginBottom: 10 }}>Ready when you are, {session.candidateName.split(" ")[0]}</h2>
        <p style={{ color: "var(--muted)", marginBottom: 6 }}>
          {questions.length} questions · {session.level} {session.role}
        </p>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 24 }}>
          Your camera and microphone record the whole session. Each question is read aloud;
          answers are transcribed on your device by the Whisper speech model — accurate in any browser,
          in {session.language || "English"}. Nothing you say is sent to a speech server.
        </p>
        <button className="btn btn-primary btn-lg" onClick={beginInterview}>Enable camera &amp; begin</button>
        {(camError || error) && <div className="error-note" role="alert">{camError || error}</div>}
        <div style={{ marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={abandon}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="room">
      <div>
        <div className="stage">
          <video ref={videoRef} autoPlay muted playsInline />
          {!stream && <div className="placeholder">Camera starting…</div>}
          {recording && (
            <span className="rec-chip"><span className="rec-dot" aria-hidden="true" />REC</span>
          )}
          <span className="timer-chip" aria-label="Remaining time">{timerText}</span>
        </div>
        {whisperStatusLine && (
          <div className="asr-status" role="status">
            {whisper.status === "loading" && (
              <span className="asr-bar" aria-hidden="true"><span style={{ width: `${whisper.progress}%` }} /></span>
            )}
            {whisperStatusLine}
          </div>
        )}
        {phase === "finishing" && (
          <p style={{ marginTop: 14, color: "var(--muted)" }}>
            Scoring answers and preparing the hiring report…
          </p>
        )}
        {error && (
          <div className="error-note" role="alert">
            {error}
            {!recordingStarted && (
              <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={retryInterviewSetup}>Retry</button>
            )}
          </div>
        )}
      </div>

      <div className="qpanel">
        <div className="qprogress" aria-label={`Question ${qIndex + 1} of ${questions.length}`}>
          {questions.map((_, i) => (
            <span key={i} className={i < qIndex ? "done" : i === qIndex ? "now" : ""} />
          ))}
        </div>

        <div className="qcard">
          <div className="qnum">QUESTION {qIndex + 1} / {questions.length}</div>
          <div className="qtext">{q.text}</div>
          {q.focus && <div className="qfocus">Testing: {q.focus}</div>}
        </div>

        {phase === "asking" && (
          <div className="room-actions">
            <button className="btn btn-primary" onClick={beginAnswer}>Start answer</button>
            <button className="btn btn-ghost" onClick={() => speak(q.text)}>Repeat question</button>
          </div>
        )}

        {phase === "answering" && (
          <div className="card answer-box">
            <p className="listening-note"><span className="rec-dot" aria-hidden="true" />Recording your answer{stt.supported && !stt.sttError ? " — live captions below" : ""}</p>
            {stt.sttError && (
              <p className="hint" style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
                {stt.sttError} Your answer is still recorded and will be transcribed by Whisper.
              </p>
            )}
            <div className="field" style={{ marginTop: 10 }}>
              <textarea
                aria-label="Your answer"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={stt.supported ? "Live captions appear here as you speak…" : "Speak freely — the accurate transcript is generated when you finish. You can also type here."}
              />
            </div>
            <div className="room-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={finishAnswer}>Done answering</button>
            </div>
          </div>
        )}

        {phase === "transcribing" && (
          <div className="card answer-box" aria-live="polite">
            <p className="listening-note" style={{ color: "var(--teal-dark)" }}>
              <span className="rec-dot" style={{ background: "var(--teal)" }} aria-hidden="true" />
              {whisper.status === "loading"
                ? `Preparing speech model… ${whisper.progress}%`
                : "Transcribing your answer with Whisper…"}
            </p>
            {draft && <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{draft}</p>}
          </div>
        )}

        {phase === "reviewing" && (
          <div className="card answer-box">
            <p style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>Review before submitting</p>
            {asrNote && <p className="hint" style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 8 }}>{asrNote}</p>}
            <div className="field">
              <textarea aria-label="Edit your answer" value={draft} onChange={e => setDraft(e.target.value)} />
            </div>
            <div className="room-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={commitAnswer}>
                {qIndex + 1 < questions.length ? "Submit & next question" : "Submit & finish interview"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (reAnswerCount >= 2) {
                    commitAnswer();
                    return;
                  }
                  setReAnswerCount(c => c + 1);
                  beginAnswer();
                }}
              >
                {reAnswerCount >= 2 ? "Next Question" : `Re-answer (${2 - reAnswerCount} left)`}
              </button>
            </div>
          </div>
        )}

        {phase !== "finishing" && (
          <button className="btn btn-danger" onClick={abandon}>End without saving</button>
        )}
      </div>
    </div>
  );
}
