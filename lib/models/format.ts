// Pure, dependency-free helpers for the model manager. Kept separate so they
// are trivially unit-testable (no native modules, no I/O).

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

// "1m 23s", "45s", "2h 5m". Returns "—" for unknown/non-finite.
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM ? `${h}h ${remM}m` : `${h}h`;
}

// Bytes/sec from two timestamped samples. Returns 0 if the interval is
// non-positive (guards against divide-by-zero and clock glitches).
export function computeRate(
  prevBytes: number,
  prevMs: number,
  curBytes: number,
  curMs: number,
): number {
  const dt = (curMs - prevMs) / 1000;
  if (dt <= 0) return 0;
  const db = curBytes - prevBytes;
  return db > 0 ? db / dt : 0;
}

// Seconds remaining given bytes left and a rate. null when rate is 0/unknown.
export function etaSeconds(
  bytesWritten: number,
  bytesTotal: number,
  bytesPerSec: number,
): number | null {
  if (bytesPerSec <= 0 || bytesTotal <= 0) return null;
  const remaining = Math.max(0, bytesTotal - bytesWritten);
  return remaining / bytesPerSec;
}

// Free-space preflight: require the model size plus headroom (KV cache, the
// `.download` temp coexisting with the final file during the rename, etc.).
export function hasEnoughSpace(
  freeBytes: number,
  sizeBytes: number,
  headroom = 1.1,
): boolean {
  if (sizeBytes <= 0) return true; // unknown size — let the download proceed
  return freeBytes >= sizeBytes * headroom;
}

// RAM fit. totalRamMb may be null (unknown) — in that case we don't block,
// we only label, so this returns "unknown" rather than a hard verdict.
export function ramFit(
  minRamMb: number | null,
  totalRamMb: number | null,
): "ok" | "tight" | "insufficient" | "unknown" {
  if (totalRamMb == null || minRamMb == null) return "unknown";
  if (totalRamMb >= minRamMb * 1.5) return "ok";
  if (totalRamMb >= minRamMb) return "tight";
  return "insufficient";
}

export function percent(written: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (written / total) * 100));
}

export interface FitLabel {
  level: "ok" | "tight" | "insufficient" | "unknown";
  text: string;
}

// Human-facing fit badge for a model, combining RAM and free disk against the
// real device. Disk is a hard blocker (can't even download); RAM is advisory.
export function fitLabel(
  minRamMb: number | null,
  totalRamMb: number | null,
  sizeBytes: number,
  freeBytes: number | null,
): FitLabel {
  if (freeBytes != null && !hasEnoughSpace(freeBytes, sizeBytes)) {
    return { level: "insufficient", text: "Not enough storage" };
  }
  switch (ramFit(minRamMb, totalRamMb)) {
    case "ok":
      return { level: "ok", text: "Runs on your device" };
    case "tight":
      return { level: "tight", text: "Tight fit — may be slow" };
    case "insufficient":
      return { level: "insufficient", text: "Needs more RAM" };
    default:
      return { level: "unknown", text: "" };
  }
}

// Reasoning ("thinking") models write long hidden reasoning before every
// answer: on a phone that means slow, rambling replies (seen with
// DeepSeek-R1-Distill-Qwen-1.5B at 6.8 tokens/s).
export function isReasoningModel(name: string): boolean {
  return /deepseek[-_ ]?r1|r1[-_ ]distill|\bqwq\b|reasoning|-think(ing)?\b|phi-4-reasoning/i.test(name);
}

export const REASONING_MODEL_NOTE =
  "Reasoning model: it thinks at length before each answer, so replies are slow and wordy on a phone. Qwen3 1.7B or 0.6B work better here.";

// Parameter count in billions read from a model name ("Qwen3-0.6B", "SmolLM2-360M"), or null.
export function paramsFromName(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*([bm])(?![a-z])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === "m" ? n / 1000 : n;
}

// Under 1.5B a model is fast but unreliable on facts and copies earlier text
// (seen with Qwen3 0.6B: "Nigeria has 20 states").
export function isTinyModel(name: string): boolean {
  const b = paramsFromName(name);
  return b !== null && b < 1.5;
}

export const TINY_MODEL_NOTE =
  "Quick helper: fast, but it can be wrong on facts. For better answers use Qwen3 1.7B on a phone with 6 GB RAM or more.";
