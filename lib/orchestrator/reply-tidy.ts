// Small models talk in circles ("So tomorrow is Wednesday… hence tomorrow is
// Wednesday") until the token cap. Cut a chat reply at the first sentence that
// repeats an earlier one, and keep plain prose to a few sentences.

const MAX_PROSE_SENTENCES = 4;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòóù\s]/g, " ").split(/\s+/).filter(Boolean);

function similar(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const setB = new Set(b);
  const shared = new Set(a.filter((w) => setB.has(w))).size;
  return shared / new Set([...a, ...b]).size >= 0.7;
}

function keepUntilRepeat(parts: string[]): string[] {
  const seen: string[][] = [];
  const kept: string[] = [];
  for (const part of parts) {
    const w = norm(part);
    if (w.length > 0 && seen.some((s) => similar(s, w))) break;
    if (w.length > 0) seen.push(w);
    kept.push(part);
  }
  return kept;
}

export function tidyReply(text: string): string {
  // Reasoning blocks and code are shown as written.
  if (/<think>|```/.test(text)) return text;
  const trimmed = text.trim();
  if (trimmed.includes("\n")) return keepUntilRepeat(trimmed.split("\n")).join("\n").trim();
  // Split only where punctuation meets a space, so "2.5" stays whole.
  const sentences = trimmed.replace(/([.!?]["')\]]*)\s+/g, "$1\u0000").split("\u0000");
  return keepUntilRepeat(sentences.map((s) => s.trim())).slice(0, MAX_PROSE_SENTENCES).join(" ");
}
