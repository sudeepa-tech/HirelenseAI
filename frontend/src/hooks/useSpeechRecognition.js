import { useCallback, useEffect, useRef, useState } from "react";

const browserSpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
const browserSupportsSpeechRecognition = Boolean(browserSpeechRecognition);

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const shouldRestartRef = useRef(false);

  const createRecognition = useCallback(() => {
    if (!browserSpeechRecognition) return null;

    const recognition = new browserSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      console.log("SpeechRecognition started");
      setIsListening(true);
    };

    recognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || "";
        if (result.isFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current + text).trim() + " ";
        } else {
          interim += text;
        }
      }

      setTranscript(finalTranscriptRef.current.trim());
      setInterimTranscript(interim.trim());
      console.log("SpeechRecognition onresult", { transcript: finalTranscriptRef.current, interim });
    };

    recognition.onerror = event => {
      console.error("SpeechRecognition error", event.error, event.message);
      switch (event.error) {
        case "no-speech":
          console.warn("SpeechRecognition no-speech detected");
          break;
        case "audio-capture":
          console.warn("SpeechRecognition audio-capture error");
          break;
        case "not-allowed":
        case "service-not-allowed":
          console.warn("SpeechRecognition not-allowed error");
          shouldRestartRef.current = false;
          setIsListening(false);
          break;
        case "network":
          console.warn("SpeechRecognition network error");
          break;
        default:
          break;
      }
    };

    recognition.onend = () => {
      console.log("SpeechRecognition ended", { isListening: shouldRestartRef.current });
      if (shouldRestartRef.current) {
        try {
          recognition.start();
          console.log("SpeechRecognition restarted");
        } catch (err) {
          console.error("SpeechRecognition restart failed", err);
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    return recognition;
  }, []);

  const startListening = useCallback(() => {
    if (!browserSupportsSpeechRecognition) return;
    if (recognitionRef.current && isListening) return;

    shouldRestartRef.current = true;
    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition();
    }

    try {
      recognitionRef.current?.start();
    } catch (err) {
      console.error("SpeechRecognition start failed", err);
    }
  }, [createRecognition, isListening]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    if (!recognitionRef.current) return;

    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error("SpeechRecognition stop failed", err);
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = "";
    setTranscript("");
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch (err) {
        console.error("SpeechRecognition cleanup failed", err);
      }
    };
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition
  };
}
