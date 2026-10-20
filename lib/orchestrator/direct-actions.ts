// Fills common actions straight from the user's words: no model call, so they
// are instant and work the same with any model, or none. Returns null when the
// words are not clear enough; the model then fills the details instead.

import { localDate, localDateTime, relativeTime } from "./intent-router";

export interface DirectCall {
  tool: string;
  parameters: Record<string, unknown>;
}

// "7", "7am", "7 a.m.", "7:30 pm", "18:00", "7 o'clock", "noon", "midnight"
const CLOCK = /\b(?:at\s+|for\s+|by\s+)?(noon|midday|midnight|(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|o'?\s?clock)?)(?=[\s,.!?]|$)/i;

// The next time the clock shows h:m (today or tomorrow), unless a day is named.
export function parseClock(text: string, now: Date): Date | null {
  const m = CLOCK.exec(text.replace(/\b\d+\s*(min|minute|hour|hr|sec|second)s?\b/gi, ""));
  if (!m) return null;
  let hour: number;
  let minute = 0;
  let meridiem: "am" | "pm" | null = null;
  const word = m[1].toLowerCase();
  if (word === "noon" || word === "midday") hour = 12;
  else if (word === "midnight") hour = 0;
  else {
    hour = Number(m[2]);
    minute = m[3] ? Number(m[3]) : 0;
    const suffix = (m[4] ?? "").toLowerCase().replace(/[^apm]/g, "");
    if (suffix.startsWith("a")) meridiem = "am";
    if (suffix.startsWith("p")) meridiem = "pm";
    // A bare number needs "at", a colon, or a suffix to count as a time.
    if (!meridiem && !m[3] && !/o'?\s?clock/i.test(m[4] ?? "") && !/\b(at|for|by)\s+\d/i.test(m[0])) return null;
    if (hour > 23 || minute > 59) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (/\btomorrow\b/i.test(text)) {
    day.setDate(day.getDate() + 1);
    return day;
  }
  if (day > now) return day;
  // "7 o'clock" at 15:00 today means 19:00; otherwise the same time tomorrow.
  if (!meridiem && hour < 12) {
    const evening = new Date(day.getTime() + 12 * 60 * 60_000);
    if (evening > now) return evening;
  }
  day.setDate(day.getDate() + 1);
  return day;
}

function when(text: string, now: Date): Date | null {
  return relativeTime(text, now) ?? parseClock(text, now);
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// Removes time phrases so what is left is the reminder or message text.
function withoutTime(text: string): string {
  return text
    .replace(/\bin (?:the next |about )?\d+\s*(min(?:ute)?s?|hours?|hrs?)\b/gi, "")
    .replace(/\b(today|tonight|tomorrow( morning| evening| night)?)\b/gi, "")
    .replace(/\b(at|for|by)\s+(noon|midday|midnight|\d{1,2}([:.]\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|o'?\s?clock)?)/gi, "")
    .replace(/\b\d{1,2}([:.]\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|o'?\s?clock)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();
}

export function directAction(tool: string, text: string, now: Date): DirectCall | null {
  const said = text.trim();
  switch (tool) {
    case "set_alarm": {
      const at = parseClock(said, now);
      if (!at) return null;
      return { tool, parameters: { time: hhmm(at), date: localDate(at) } };
    }
    case "set_timer": {
      const m = /(\d+)\s*(sec(?:ond)?s?|min(?:ute)?s?|hours?|hrs?)\b/i.exec(said);
      if (!m) return null;
      const n = Number(m[1]);
      const minutes = /^h/i.test(m[2]) ? n * 60 : /^s/i.test(m[2]) ? Math.max(1, Math.round(n / 60)) : n;
      return { tool, parameters: { minutes } };
    }
    case "set_reminder": {
      const at = when(said, now);
      if (!at) return null;
      const about = /\b(?:to|about|that)\s+(.+)$/i.exec(withoutTime(said.replace(/^(please\s+)?(remind me|set (a |me a )?reminder|reminder)\b/i, "")))?.[1];
      return { tool, parameters: { text: about?.trim() || "Reminder", datetime: localDateTime(at) } };
    }
    case "send_sms":
    case "schedule_sms": {
      // "type an SMS for Daniel Phantom (saying ...)": the message text is optional.
      const drafted = /\b(?:type|write|draft|compose|prepare|create)\s+(?:an?\s+)?(?:sms(?:\s+message)?|text(?:\s+message)?|message)\s+(?:for|to)\s+(.+?)(?:\s+(?:that|saying|to say|and say)\s+(.+))?$/i.exec(said);
      if (drafted && tool === "send_sms") {
        const contact = withoutTime(drafted[1]);
        return contact ? { tool, parameters: { contact, text: drafted[2] ? withoutTime(drafted[2]) : "" } } : null;
      }
      const m = /^(?:please\s+)?(?:send\s+(?:a\s+)?)?(?:text|message|sms)(?:\s+to)?\s+(.+?)\s+(?:that|saying|to say|and say)\s+(.+)$/i.exec(said) ??
        (drafted?.[2] ? drafted : null);
      if (!m) return null;
      const contact = withoutTime(m[1]);
      const body = withoutTime(m[2]);
      if (!contact || !body) return null;
      if (tool === "send_sms") return { tool, parameters: { contact, text: body } };
      const at = when(said, now);
      return at ? { tool, parameters: { contact, text: body, datetime: localDateTime(at) } } : null;
    }
    case "get_screen_time":
      return { tool, parameters: {} };
    case "add_task": {
      const title = /^(?:please\s+)?(?:add|create|new|save|make)\s+(?:a\s+)?(?:new\s+)?task\b\s*(?:to\s+|called\s+|named\s+)?[:,-]?\s*(.+)$/i.exec(said)?.[1]?.trim();
      if (!title) return null;
      // "finish my essay by 6pm": save the task and remind at that time.
      const at = when(title, now);
      const cleanTitle = at ? withoutTime(title) : title;
      if (!cleanTitle) return null;
      return {
        tool,
        parameters: { title: cleanTitle.slice(0, 200), ...(at ? { remindAt: localDateTime(at) } : {}) },
      };
    }
    default:
      return null;
  }
}

export interface Capture {
  title: string;
  // The time the user said, if any.
  at: Date | null;
  // A day without a clock ("tomorrow"): the capture screen offers times instead of guessing.
  day: Date | null;
}

// Quick capture: "call the dentist tomorrow at 9" becomes a title and a time.
export function captureFrom(text: string, now: Date): Capture {
  const said = text.trim().replace(/^(please\s+)?(remind me (to|about)|add (a )?(new )?task( to)?|i need to|i have to|don'?t forget to)\s+/i, "");
  const at = when(said, now);
  const dayWord = /\b(tomorrow|tonight|today)\b/i.exec(said)?.[1]?.toLowerCase();
  const day = !at && dayWord
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dayWord === "tomorrow" ? 1 : 0))
    : null;
  const stripped = at || day ? withoutTime(said) : said;
  const title = (stripped || said).replace(/^[a-z]/, (c) => c.toUpperCase()).slice(0, 200);
  return { title, at, day };
}
