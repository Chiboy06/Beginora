// Several timed plans said in one breath: "read by 5, by 6 I'll go jogging,
// by 7 dinner ... by 11 I'll be sleeping". Each piece with a time becomes one
// item. Times without am/pm are read in order, so "5 ... 6 ... 11" is
// 5 pm to 11 pm, not 5 am.

import { parseClock } from "./direct-actions";

export interface ScheduleItem {
  title: string;
  at: Date;
}

// "by 5", "at 6:30", "around 7pm", "9 am", "noon". "for 5 minutes" is not a time.
const TIME = /(?:\b(?:by|at|around|from|until|till)\s+)(noon|midnight|\d{1,2}(?:[:.]\d{2})?(?:\s*(?:a\.?\s?m\.?|p\.?\s?m\.?|o'?\s?clock))?)(?![\d:])|\b(\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?))(?=[\s,.!?;]|$)/gi;

const OPENER = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:set|add|create|make|schedule|plan|put)\s+(?:me\s+|up\s+)?(?:an?\s+|my\s+)?(?:appointments?|reminders?|tasks?|schedule|plans?|day)\s*(?:to|for)?\s*/i;
const FILLER = /^(?:(?:and|then|also|so)\s+)*(?:i'?ll be|i will be|i'?m going to|i am going to|i'?ll|i will|i'?m|i am|i need to|i have to|i want to|i should|going to|gonna)\s+/i;

function cleanTitle(piece: string): string {
  return piece
    .replace(TIME, " ")
    .replace(/\b(today|tonight|tomorrow|this (morning|afternoon|evening))\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[,;:\s-]+|[,;:.\s-]+$/g, "")
    .replace(OPENER, "")
    .replace(FILLER, "")
    .replace(/^(to|for)\s+/i, "")
    .trim()
    .replace(/^[a-z]/, (c) => c.toUpperCase())
    .slice(0, 200);
}

const timesIn = (s: string) => [...s.matchAll(TIME)].map((m) => (m[1] ?? m[2]).trim());

// Two or more times in one message make a schedule; otherwise null.
export function scheduleFromWords(text: string, now: Date): ScheduleItem[] | null {
  if (timesIn(text).length < 2) return null;
  const pieces = text
    .split(/[,;\n]|\.\s+|\s+(?:and then|then|and)\s+(?=(?:by|at|around|from|until|till|\d))/i)
    // "work at 9am and call mum at 6pm": a piece with two times splits at "and".
    .flatMap((p) => (timesIn(p).length > 1 ? p.split(/\s+(?:and then|then|and)\s+/i) : [p]))
    .map((p) => p.trim())
    .filter(Boolean);

  // "tomorrow" anywhere means the whole schedule starts tomorrow.
  let ref = /\btomorrow\b/i.test(text) ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0) : now;
  const items: ScheduleItem[] = [];
  let pendingTitle = "";
  for (const piece of pieces) {
    const times = timesIn(piece);
    if (times.length === 0) {
      // "by 5, reading": a piece with no time names the item before or after it.
      if (items.length && !items[items.length - 1].title) items[items.length - 1].title = cleanTitle(piece);
      else pendingTitle = cleanTitle(piece);
      continue;
    }
    for (const t of times) {
      const at = parseClock(`at ${t}`, ref);
      if (!at) continue;
      const title = cleanTitle(piece) || pendingTitle || (items.length ? items[items.length - 1].title : "");
      pendingTitle = "";
      items.push({ title, at });
      // The next time is read as later than this one.
      ref = at;
    }
  }
  const named = items.filter((i) => i.title.length >= 2);
  return named.length >= 2 ? named : null;
}
