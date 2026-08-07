const MS_PER_MINUTE = 60_000;

export function getInterviewDurationMs(durationMinutes) {
  const minutes = Number(durationMinutes) || 60;
  return Math.max(60_000, minutes * MS_PER_MINUTE);
}

export function getRemainingTimeMs(endTime, now = Date.now()) {
  return Math.max(0, Number(endTime || 0) - now);
}

export function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
