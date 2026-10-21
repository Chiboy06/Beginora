// Pure helpers for hands-free conversation: what a spoken phrase means, the
// spoken greeting, and reply text cleaned up for text-to-speech.

export type VoiceIntent =
  | { kind: "confirm"; approved: boolean }
  | { kind: "stop" }
  | { kind: "open"; route: string; label: string }
  | { kind: "message"; text: string };

// Spoken screen names, matched without the model so navigation is reliable.
const SCREENS: { words: RegExp; route: string; label: string }[] = [
  { words: /^(today|home|my day)$/, route: "/", label: "Today" },
  { words: /^(tasks?|my tasks|task list|plan|planner|my plan)$/, route: "/tasks", label: "your plan" },
  { words: /^(talk|chat)$/, route: "/talk", label: "Talk" },
  { words: /^(journal|my journal|diary|moods?|mood tracker|my mood)$/, route: "/journal", label: "your journal" },
  { words: /^((a )?new journal entry|journal entry)$/, route: "/journal/new", label: "a new journal entry" },
  { words: /^(routines?|my routines|routine library)$/, route: "/routines", label: "your routines" },
  { words: /^(goals?|my goals)$/, route: "/goals", label: "your goals" },
  { words: /^(weekly plan|week plan|plan my week|my week)$/, route: "/weekly-plan", label: "Plan my week" },
  { words: /^(focus|focus timer|timer)$/, route: "/task/focus", label: "Focus" },
  { words: /^(reset|reset my day)$/, route: "/reset", label: "Reset my day" },
  { words: /^(capture|quick capture)$/, route: "/capture", label: "Capture" },
  { words: /^(memory|memories)$/, route: "/memory", label: "your memories" },
  { words: /^(online model|api key)$/, route: "/online-ai", label: "Online model" },
  { words: /^(telegram)$/, route: "/telegram", label: "Telegram" },
  { words: /^(settings?)$/, route: "/settings", label: "Settings" },
  { words: /^(permissions?|connections?)$/, route: "/connectors", label: "Permissions" },
  { words: /^(models?)$/, route: "/models", label: "Models" },
  { words: /^(calendar|my calendar)$/, route: "/calendar", label: "your calendar" },
  { words: /^(history|conversations?|old chats?)$/, route: "/history", label: "your conversations" },
  { words: /^(documents?|files?)$/, route: "/documents", label: "Documents" },
  { words: /^(new task|add (a )?task)$/, route: "/task/new", label: "a new task" },
];
const OPEN = /^(open|show( me)?|go to|take me to|bring up)\s+(the\s+|my\s+)?(.+)$/i;
// Page actions said without "open": "plan my week", "reset my day".
const DIRECT = /^(?:let'?s\s+)?(plan my week|reset my day|start (?:a )?focus(?: session)?)$/i;

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|confirm|do it|go ahead|please do|sounds good)\b/i;
const NO = /^(no|nope|cancel|don'?t|do not|never ?mind|not now)\b/i;
const STOP = /^(stop|stop listening|goodbye|bye|exit|that'?s all|end)\.?$/i;

// pendingConfirmation: an action (alarm, text, reminder) is waiting for approval.
export function interpretVoice(text: string, pendingConfirmation: boolean): VoiceIntent {
  const said = text.trim().replace(/[.!?]+$/, "");
  if (STOP.test(said)) return { kind: "stop" };
  if (/^(go )?back$/i.test(said)) return { kind: "open", route: "back", label: "back" };
  const direct = DIRECT.exec(said)?.[1]?.toLowerCase().replace(/^start (a )?focus.*/, "focus");
  const target = (OPEN.exec(said)?.[4] ?? direct)?.toLowerCase().trim().replace(/ (page|screen|tab)$/, "");
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
export function toSpeech(text: string, maxChars = 320): string {
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
