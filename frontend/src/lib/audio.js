/** Decode a recorded audio blob to 16 kHz mono Float32 PCM — Whisper's input format. */
export async function blobToPCM(blob, targetRate = 16000) {
  const arrayBuf = await blob.arrayBuffer();
  const probe = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await probe.decodeAudioData(arrayBuf);
  probe.close();
  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/** Interview language -> Whisper language code. */
export const WHISPER_LANG = {
  English: "en", Hindi: "hi", Spanish: "es", French: "fr", German: "de",
  Portuguese: "pt", Japanese: "ja", Arabic: "ar", Bengali: "bn"
};
