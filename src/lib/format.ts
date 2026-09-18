export function formatInt(n: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(n));
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return " - ";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  if (m > 0) {
    return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  return `${s}.${String(cs).padStart(2, "0")}s`;
}

export function formatClock(secondsLeft: number) {
  const s = Math.max(0, secondsLeft);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const frac = Math.floor((s % 1) * 10);
  if (m > 0) return `${m}:${String(r).padStart(2, "0")}`;
  return `${r}.${frac}`;
}
