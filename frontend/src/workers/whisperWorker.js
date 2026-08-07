/**
 * Whisper ASR worker — runs OpenAI's Whisper speech-recognition model
 * entirely in the browser via transformers.js (WebGPU when available,
 * WASM otherwise). Zero server cost, zero AI tokens, works in any modern
 * browser, 90+ languages. Model weights download once and are cached.
 */
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

let asr = null;

async function load({ model }) {
  const tryDevices = [];
  if (typeof navigator !== "undefined" && navigator.gpu) tryDevices.push("webgpu");
  tryDevices.push("wasm");

  let lastErr;
  for (const device of tryDevices) {
    try {
      asr = await pipeline("automatic-speech-recognition", model, {
        device,
        dtype: device === "webgpu" ? "fp32" : "q8",
        progress_callback: p => {
          if (p.status === "progress" && p.file?.endsWith(".onnx")) {
            self.postMessage({ type: "progress", progress: Math.round(p.progress || 0) });
          }
        }
      });
      self.postMessage({ type: "ready", device });
      return;
    } catch (err) {
      lastErr = err;
      asr = null;
    }
  }
  throw lastErr;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await load(data);
    } else if (data.type === "transcribe") {
      if (!asr) throw new Error("Model not loaded");
      const options = { chunk_length_s: 30, stride_length_s: 5, task: "transcribe" };
      if (data.language) options.language = data.language;
      const out = await asr(data.audio, options);
      self.postMessage({ type: "result", id: data.id, text: (out.text || "").trim() });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: data?.id, message: String(err?.message || err) });
  }
};
