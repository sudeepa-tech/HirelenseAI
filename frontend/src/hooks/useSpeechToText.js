import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Free in-browser transcription via the Web Speech API — zero AI token cost.
 * Where unsupported (some browsers), the UI falls back to typing.
 */
export function useSpeechToText() {
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const supported = Boolean(SR);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sttError, setSttError] = useState(null);
  const recRef = useRef(null);
  const finalRef = useRef("");
  const keepAliveRef = useRef(false);

  const start = useCallback(() => {
    if (!SR) return;
    setSttError(null);
    finalRef.current = "";
    setTranscript("");
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = e => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += chunk + " ";
        else interim += chunk;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onend = () => {
      // Chrome stops after silence; restart while an answer is in progress.
      if (keepAliveRef.current) { try { rec.start(); } catch {} }
      else setListening(false);
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setSttError("Microphone access blocked for live captions.");
        keepAliveRef.current = false;
      } else if (e.error === "network") {
        setSttError("Live captions need a network connection in this browser.");
        keepAliveRef.current = false;
      }
    };
    keepAliveRef.current = true;
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [SR]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    recRef.current?.stop();
    setListening(false);
    return (finalRef.current || transcript).trim();
  }, [transcript]);

  const reset = useCallback(() => { finalRef.current = ""; setTranscript(""); }, []);

  useEffect(() => () => { keepAliveRef.current = false; recRef.current?.stop?.(); }, []);

  return { supported, listening, transcript, setTranscript, start, stop, reset, sttError };
}

/** Speak a question aloud (free, browser TTS). */
export function speak(text) {
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}
