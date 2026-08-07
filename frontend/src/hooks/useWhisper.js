import { useCallback, useEffect, useRef, useState } from "react";
import { blobToPCM } from "../lib/audio.js";

/**
 * On-device Whisper ASR. status: idle -> loading (progress %) -> ready | error.
 * transcribe(blob, lang) resolves to the recognized text.
 */
export const WHISPER_MODELS = {
  fast: { id: "onnx-community/whisper-tiny", label: "Fast (~40 MB)" },
  balanced: { id: "onnx-community/whisper-base", label: "Balanced (~80 MB)" },
  max: { id: "onnx-community/whisper-small", label: "Max accuracy (~250 MB)" }
};

export function useWhisper() {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [device, setDevice] = useState(null);
  const workerRef = useRef(null);
  const pendingRef = useRef(new Map());
  const readyPromiseRef = useRef(null);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../workers/whisperWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") setProgress(data.progress);
      else if (data.type === "ready") { setStatus("ready"); setDevice(data.device); readyPromiseRef.current?.resolve(); }
      else if (data.type === "result") pendingRef.current.get(data.id)?.resolve(data.text), pendingRef.current.delete(data.id);
      else if (data.type === "error") {
        if (data.id && pendingRef.current.has(data.id)) {
          pendingRef.current.get(data.id).reject(new Error(data.message));
          pendingRef.current.delete(data.id);
        } else {
          setStatus("error");
          readyPromiseRef.current?.reject(new Error(data.message));
        }
      }
    };
    worker.onerror = e => { setStatus("error"); readyPromiseRef.current?.reject(new Error(e.message || "Worker failed")); };
    workerRef.current = worker;
    return worker;
  }, []);

  const load = useCallback(modelId => {
    if (status === "ready" || status === "loading") return readyPromiseRef.current?.promise;
    const worker = ensureWorker();
    setStatus("loading");
    setProgress(0);
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    readyPromiseRef.current = { promise, resolve, reject };
    worker.postMessage({ type: "load", model: modelId });
    return promise;
  }, [status, ensureWorker]);

  const transcribe = useCallback(async (blob, language, timeoutMs = 180_000) => {
    if (!workerRef.current || status !== "ready") throw new Error("Whisper not ready");
    const audio = await blobToPCM(blob);
    if (audio.length < 1600) return ""; // <0.1s of audio
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pendingRef.current.delete(id); reject(new Error("Transcription timed out")); }, timeoutMs);
      pendingRef.current.set(id, {
        resolve: t => { clearTimeout(timer); resolve(t); },
        reject: e => { clearTimeout(timer); reject(e); }
      });
      workerRef.current.postMessage({ type: "transcribe", id, audio, language }, [audio.buffer]);
    });
  }, [status]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { status, progress, device, load, transcribe };
}
