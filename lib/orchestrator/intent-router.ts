// Picks the tool for clear action requests from keywords, so the model only
// fills in that one tool's details. Small on-device models (0.6B to 1.7B) pick
// the wrong tool among many, or answer calendar questions from imagination;
// a narrowed prompt fixes both. Anything not matched goes to the model as before.

const RULES: { tool: string; test: RegExp }[] = [
  { tool: "get_screen_time", test: /\b(screen ?time|app usage|phone usage|time (i )?spent on|how (long|much time) (have i|did i|i)\b)/i },
  { tool: "add_task", test: /^(please\s+)?(add|create|new|save|make)\s+(a\s+)?(new\s+)?task\b/i },
  { tool: "send_telegram", test: /\btelegram\b/i },
  { tool: "draft_email", test: /\be-?mail\b/i },
  {
    tool: "create_event",
    test: /\bto my (calendar|schedule|agenda)\b|\b(add|put|create|book|plan)\b[^.?!]*\b(calendar|event|appointment|meeting)\b/i,
  },
  {
    tool: "get_calendar_events",
    test: /\b(what'?s|what is|what do i have|what have i got|show( me)?|check|list|read|any)\b[^.?!]*\b(calendar|schedule|agenda|events?|appointments?|meetings?)\b/i,
  },
  { tool: "set_alarm", test: /\balarm\b|\bwake me( up)?\b/i },
  { tool: "set_timer", test: /\btimer\b|\bcount ?down\b/i },
  { tool: "set_reminder", test: /\bremind me\b|\breminder\b/i },
  { tool: "sms", test: /^(please\s+)?(text|sms|message)\b|\bsend (a |an )?(text|sms|message)\b/i },
  { tool: "make_call", test: /^(please\s+)?(call|phone|ring|dial)\b/i },
  { tool: "save_note", test: /\b(save|take|make|write|add)\b[^.?!]*\bnotes?\b|^note\b/i },
  {
    tool: "break_down_task",
    test: /\b((i |i'?ve )?(need|have|got) to (start|do|finish|write|study|clean|prepare|submit|read|revise)\b|haven'?t (started|begun)|\bdue (today|tomorrow|soon|on|next|this)\b|break (it |this |that )?down|i'?m stuck|stuck on|keep (avoiding|putting off)|procrastinat|overwhelm|don'?t know where to start|help me (start|begin|get started)|can'?t (start|get started))/i,
  },
];

// A time in a text request means "send it later".
const LATER = /\bat \d|\b(tomorrow|tonight|later)\b|\bin \d+\s*(min|minute|hour|hr)s?\b|\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;

export function routeIntent(text: string): string | null {
  const said = text.trim();
  const rule = RULES.find((r) => r.test.test(said));
  if (!rule) return null;
  if (rule.tool === "sms") return LATER.test(said) ? "schedule_sms" : "send_sms";
  return rule.tool;
}

const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 };

// "in 20 minutes", "in the next 1 hour", "in an hour", "in half an hour":
// computed from the clock, because small models get this arithmetic wrong.
export function relativeTime(text: string, now: Date): Date | null {
  if (/\bin half an? hour\b/i.test(text)) return new Date(now.getTime() + 30 * 60_000);
  const m = /\bin (?:the next |about |around )?(\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty)\s*(min(?:ute)?s?|hours?|hrs?)\b/i.exec(text);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1].toLowerCase()];
  const minutes = /^h/i.test(m[2]) ? n * 60 : n;
  return new Date(now.getTime() + minutes * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDateTime = (d: Date) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// The day a calendar question is about: today, tomorrow, or the next named weekday.
export function dateFromText(text: string, now: Date): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\bday after tomorrow\b/i.test(text)) day.setDate(day.getDate() + 2);
  else if (/\btomorrow\b/i.test(text)) day.setDate(day.getDate() + 1);
  else {
    const named = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
    // The named day this week, or today if it is that day.
    if (named !== -1) day.setDate(day.getDate() + ((named - day.getDay() + 7) % 7));
  }
  return localDate(day);
}

// Whether a message is about a time or date. Only those messages carry the
// hidden time tag; on other questions small models copy it into answers
// ("Independence is on 20 October, which is today in the Time context").
export function mentionsTime(text: string): boolean {
  return /\b(today|tonight|tomorrow|yesterday|now|morning|afternoon|evening|o'?clock|noon|midnight|weekend|next week|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|a\.m\.|p\.m\.|oggi|stasera|domani|ieri|adesso|mattina|pomeriggio|sera)\b|\d\s*(am|pm|a\.m\.|p\.m\.)|\d{1,2}[:.]\d{2}|\bin \d+\s*(min|minute|hour|hr)s?\b/i.test(text);
}
