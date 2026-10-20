// Pure gate for memory extraction, kept dependency-free so it is unit-testable
// without pulling in the LLM engine / native modules.
//
// Avoids the expensive second LLM pass on turns that can't yield a useful
// personal fact (ORCH-1 / ORCH-12). Tool-call turns produce a canned
// confirmation ("Done!"), and very short messages are greetings/acks.

const MIN_EXTRACTION_CHARS = 12;

export function shouldExtractMemory(
  userText: string,
  isToolCall: boolean,
): boolean {
  if (isToolCall) return false;
  return userText.trim().length >= MIN_EXTRACTION_CHARS;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9àèéìòóù\s']/g, " ").split(/\s+/).filter(Boolean);

// True when `text` repeats any run of `n` words from `source`. Small models
// "remember" the system prompt's own rules as facts about the user.
export function echoesText(text: string, source: string, n = 4): boolean {
  const src = ` ${words(source).join(" ")} `;
  const w = words(text);
  for (let i = 0; i + n <= w.length; i++) {
    if (src.includes(` ${w.slice(i, i + n).join(" ")} `)) return true;
  }
  return false;
}

// Memories go into the prompt only for questions about the user: on other
// questions small models recite them instead of answering.
export function asksAboutUser(text: string): boolean {
  return /\b(my|me|mine|myself|remember|you know about|who am i|mio|mia|miei|mie|di me|ricord\w*|sai di)\b/i.test(text);
}
