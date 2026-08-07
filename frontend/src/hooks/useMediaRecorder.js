import { useCallback, useEffect, useRef, useState } from "react";

/** Webcam + mic capture with MediaRecorder. Returns preview stream + final blob. */
export function useMediaRecorder() {
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const answerRecRef = useRef(null);
  const answerChunksRef = useRef([]);

  const reset = useCallback(() => {
    try {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop?.();
    } catch {}
    try {
      answerRecRef.current?.state !== "inactive" && answerRecRef.current?.stop?.();
    } catch {}
    stream?.getTracks().forEach(t => t.stop());
    recorderRef.current = null;
    answerRecRef.current = null;
    chunksRef.current = [];
    answerChunksRef.current = [];
    setRecording(false);
    setStream(null);
    setError(null);
  }, [stream]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setStream(media);
      const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";
      const rec = new MediaRecorder(media, mime ? { mimeType: mime, videoBitsPerSecond: 1_200_000 } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.start(1000);
      if (rec.state !== "recording") {
        throw new Error("MediaRecorder did not enter recording state");
      }
      recorderRef.current = rec;
      setRecording(true);
      return true;
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Camera and microphone access was denied. Allow access in your browser settings to start the interview."
          : "Could not access camera or microphone: " + err.message
      );
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise(resolve => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" });
        resolve(blob);
      };
      rec.stop();
      setRecording(false);
    });
  }, []);

  /** Record just the microphone for one answer (feeds the Whisper transcriber). */
  const startAnswerAudio = useCallback(() => {
    if (!stream) return false;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return false;
    const audioStream = new MediaStream(audioTracks);
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t)) || "";
    const rec = new MediaRecorder(audioStream, mime ? { mimeType: mime, audioBitsPerSecond: 64_000 } : undefined);
    answerChunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size) answerChunksRef.current.push(e.data); };
    rec.start(500);
    answerRecRef.current = rec;
    return true;
  }, [stream]);

  const stopAnswerAudio = useCallback(() => {
    return new Promise(resolve => {
      const rec = answerRecRef.current;
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () => resolve(new Blob(answerChunksRef.current, { type: rec.mimeType || "audio/webm" }));
      rec.stop();
    });
  }, []);

  const teardown = useCallback(() => {
    try {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop?.();
    } catch {}
    try {
      answerRecRef.current?.state !== "inactive" && answerRecRef.current?.stop?.();
    } catch {}
    stream?.getTracks().forEach(t => t.stop());
    recorderRef.current = null;
    answerRecRef.current = null;
    chunksRef.current = [];
    answerChunksRef.current = [];
    setStream(null);
    setRecording(false);
  }, [stream]);

  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  return { stream, recording, error, start, stop, teardown, reset, startAnswerAudio, stopAnswerAudio };
}
