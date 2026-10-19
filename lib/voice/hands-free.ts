// Pure helpers for hands-free conversation: what a spoken phrase means, the
// spoken greeting, and reply text cleaned up for text-to-speech.

export type VoiceIntent =
  | { kind: "confirm"; approved: boolean }
  | { kind: "stop" }
  | { kind: "message"; text: string };

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please do|sounds good)\b/i;
const NO = /^(no|nope|cancel|don'?t|do not|never ?mind|not now)\b/i;
const STOP = /^(stop|stop listening|goodbye|bye|exit|that'?s all|end)\.?$/i;

// pendingConfirmation: an action (alarm, text, reminder) is waiting for approval.
export function interpretVoice(text: string, pendingConfirmation: boolean): VoiceIntent {
  const said = text.trim().replace(/[.!?]+$/, "");
  if (STOP.test(said)) return { kind: "stop" };
  if (pendingConfirmation) {
    if (YES.test(said)) return { kind: "confirm", approved: true };
    if (NO.test(said)) return { kind: "confirm", approved: false };
  }
  return { kind: "message", text: said };
}

export function greeting(name: string | undefined, hour: number): string {
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const who = name?.trim() ? `, ${name.trim()}` : "";
  return `${part}${who}. I'm Beginora. What would you like to start?`;
}

// Markdown symbols, links and long lists read badly aloud.
export function toSpeech(text: string, maxChars = 600): string {
  const plain = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxChars) return plain;
  const cut = plain.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return lastStop > maxChars / 2 ? cut.slice(0, lastStop + 1) : cut;
}
