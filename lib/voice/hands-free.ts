// Pure helpers for hands-free conversation: what a spoken phrase means, the
// spoken greeting, and reply text cleaned up for text-to-speech.

export type VoiceIntent =
  | { kind: "confirm"; approved: boolean }
  | { kind: "stop" }
  | { kind: "open"; route: string; label: string }
  | { kind: "message"; text: string };

// Spoken screen names, matched without the model so navigation is reliable.
const SCREENS: { words: RegExp; route: string; label: string }[] = [
  { words: /^(tasks?|my tasks|task list)$/, route: "/tasks", label: "your tasks" },
  { words: /^(settings?)$/, route: "/settings", label: "Settings" },
  { words: /^(permissions?|connections?)$/, route: "/connectors", label: "Permissions" },
  { words: /^(models?)$/, route: "/models", label: "Models" },
  { words: /^(calendar|my calendar)$/, route: "/calendar", label: "your calendar" },
  { words: /^(history|conversations?|old chats?)$/, route: "/history", label: "your conversations" },
  { words: /^(documents?|files?)$/, route: "/documents", label: "Documents" },
  { words: /^(new task|add (a )?task)$/, route: "/task/new", label: "a new task" },
];
const OPEN = /^(open|show( me)?|go to|take me to)\s+(the\s+)?(.+)$/i;

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please do|sounds good)\b/i;
const NO = /^(no|nope|cancel|don'?t|do not|never ?mind|not now)\b/i;
const STOP = /^(stop|stop listening|goodbye|bye|exit|that'?s all|end)\.?$/i;

// pendingConfirmation: an action (alarm, text, reminder) is waiting for approval.
export function interpretVoice(text: string, pendingConfirmation: boolean): VoiceIntent {
  const said = text.trim().replace(/[.!?]+$/, "");
  if (STOP.test(said)) return { kind: "stop" };
  if (/^(go )?back$/i.test(said)) return { kind: "open", route: "back", label: "back" };
  const target = OPEN.exec(said)?.[4]?.toLowerCase().trim();
  const screen = target ? SCREENS.find((s) => s.words.test(target)) : undefined;
  if (screen) return { kind: "open", route: screen.route, label: screen.label };
  if (pendingConfirmation) {
    if (YES.test(said)) return { kind: "confirm", approved: true };
    if (NO.test(said)) return { kind: "confirm", approved: false };
  }
  return { kind: "message", text: said };
}

// The recognizer opens its own screen, which React Native reports as the app
// going to the background; only a real leave should end hands-free mode.
export function shouldStopForAppState(state: string, recognizerOpen: boolean): boolean {
  return state !== "active" && !recognizerOpen;
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
