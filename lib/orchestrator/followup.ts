// Interactive follow-ups, the same for typing and voice: "set me a task" asks
// what, when, whether to remind and any details; "I'm feeling happy" saves the
// mood, asks about the day and when to ask each day. Pure: each turn returns
// the reply, the next question (or null) and what to save.

import { parseClock } from "./direct-actions";
import { routeIntent } from "./intent-router";
import { scheduleFromWords } from "./schedule-words";
import { draftToTasks, whenFromWords, isoDay, type PlannedTask } from "../planner/weekly";
import { MOODS } from "../planner/moods";

// again: the last answer was not understood and the question was asked twice.
export type FollowUp = (
  | { kind: "task"; step: "title" | "when" | "remind" | "notes"; title: string; dueAt: number | null; remind: boolean }
  | { kind: "tasks_confirm"; tasks: PlannedTask[] }
  | { kind: "schedule_confirm"; items: { title: string; at: number }[] }
  | { kind: "reminder"; step: "text" | "when"; text: string }
  | { kind: "mood_note"; positive: boolean }
  | { kind: "mood_time" }
) & { again?: boolean };

export type Effect =
  | { type: "create_task"; title: string; dueAt: number | null; remind: boolean; notes: string | null }
  | { type: "create_tasks"; tasks: PlannedTask[] }
  | { type: "create_schedule"; items: { title: string; at: number }[] }
  | { type: "create_reminder"; text: string; at: number }
  | { type: "log_mood"; mood: string }
  | { type: "add_mood_note"; note: string }
  | { type: "daily_checkin"; hour: number; minute: number }
  | { type: "daily_checkin_off" };

export interface Turn {
  reply: string;
  next: FollowUp | null;
  effect?: Effect;
}

export interface FollowUpContext {
  // Whether the daily "how was your day?" check-in is already set.
  dailyCheckInSet: boolean;
}

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|please|please do|do it|go ahead|of course|sounds good)\b/i;
const NO = /^(no|nope|nah|no thanks|not now|skip|none|nothing|that'?s all|that is all|no details?)\b/i;
const CANCEL = /^(cancel|never ?mind|forget it|stop|abort)\b/i;
const NO_TIME = /^(no time|no date|whenever|any ?time|later|sort (it )?later|no deadline|none|no)\b/i;

const clean = (s: string) => s.trim().replace(/^(to|for|called|named|about|that)\s+/i, "").replace(/[.!?]+$/, "").trim();
const cap = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

function whenText(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// Words people use for how they feel, mapped to the journal's moods.
const MOOD_WORDS: Record<string, string> = {
  happy: "great", great: "great", amazing: "great", awesome: "great", fantastic: "great", excellent: "great", wonderful: "great", excited: "great", productive: "great", proud: "great", motivated: "great",
  good: "good", nice: "good", glad: "good", grateful: "good", thankful: "good", positive: "good",
  calm: "calm", relaxed: "calm", peaceful: "calm", chill: "calm", rested: "calm",
  okay: "okay", ok: "okay", fine: "okay", alright: "okay", meh: "okay", average: "okay",
  tired: "tired", exhausted: "tired", sleepy: "tired", drained: "tired", worn: "tired",
  stressed: "stressed", overwhelmed: "stressed", anxious: "stressed", nervous: "stressed", worried: "stressed", busy: "stressed",
  sad: "sad", down: "sad", low: "sad", unhappy: "sad", lonely: "sad", upset: "sad", bad: "sad",
  frustrated: "frustrated", angry: "frustrated", annoyed: "frustrated", irritated: "frustrated", mad: "frustrated",
};
const POSITIVE = new Set(["great", "good", "calm"]);

const MOOD_SENTENCE = /^(?:today\s+)?(?:i\s*(?:'m feeling|am feeling|feel like i'?m|'ve been|have been|'m|am|feel|was)|my day (?:is|was|has been)|today (?:is|was|has been)|feeling)\s+(?:so |really |very |a bit |a little |kind of |quite |pretty |super |not )?([a-z]+)\b[^?]*$/i;

export function moodFromWords(text: string): string | null {
  const m = MOOD_SENTENCE.exec(text.trim());
  if (!m) return null;
  // "not good" / "not so happy" is low, not good.
  const negated = new RegExp(`\\bnot\\s+(?:\\w+\\s+)?${m[1]}\\b`, "i").test(text);
  const mood = MOOD_WORDS[m[1].toLowerCase()];
  if (!mood) return null;
  return negated && POSITIVE.has(mood) ? "sad" : mood;
}

function moodLabel(key: string): string {
  const m = MOODS.find((x) => x.key === key);
  return m ? `${m.emoji} ${m.label}` : key;
}

function askDailyTime(ctx: FollowUpContext, done: string): Turn {
  return ctx.dailyCheckInSet
    ? { reply: done, next: null }
    : { reply: `${done} When would you like me to ask you each day how your day was? Say a time, like 8 pm, or say no.`, next: { kind: "mood_time" } };
}

function askWhen(title: string): Turn {
  return {
    reply: `Got it: "${title}". When should it be done? Say a day and time, like tomorrow at 5 pm, or say no time.`,
    next: { kind: "task", step: "when", title, dueAt: null, remind: false },
  };
}

const TASK_OPEN = /^(?:please\s+)?(?:can you\s+|could you\s+|i want to\s+|i'?d like to\s+)?(?:set|add|create|make|save|put|give|new|start)\s+(?:me\s+|up\s+)?(?:an?\s+|some\s+)?(?:new\s+)?(task|tasks|to-?do|to-?dos|todo|todos)\b\s*[:,-]?\s*(.*)$/i;
const REMINDER_OPEN = /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:(?:set|add|create|make|give)\s+(?:me\s+)?(?:an?\s+)?(?:new\s+)?reminder\b|remind me)\s*[:,-]?\s*(.*)$/i;
const DAILY_ASK = /\b(?:ask|check (?:in )?with|remind) me\b.*\b(?:how my day (?:was|is|went)|about my day|to journal|for my mood)\b/i;
const DAILY_OFF = /\b(?:stop|don'?t|do not|no more)\b.*\b(?:ask(?:ing)?|check(?:ing)?)\b.*\bmy day\b/i;

// A new conversation started by these words, or null.
export function startFollowUp(text: string, now: Date, ctx: FollowUpContext): Turn | null {
  const said = text.trim();

  // Several times in one message: a whole schedule, read back before saving.
  const schedule = scheduleFromWords(said, now);
  if (schedule) {
    const items = schedule.map((i) => ({ title: i.title, at: i.at.getTime() }));
    const list = items.map((i) => `- ${whenText(i.at)}: ${i.title}`).join("\n");
    return { reply: `I heard ${items.length} plans:\n${list}\nShall I add each one as a task with a reminder?`, next: { kind: "schedule_confirm", items } };
  }

  if (DAILY_OFF.test(said)) return { reply: "Okay, I won't ask about your day any more. You can turn it back on in Journal.", next: null, effect: { type: "daily_checkin_off" } };
  if (DAILY_ASK.test(said)) {
    const at = parseClock(said, now);
    return at
      ? { reply: `Done. I'll ask you how your day was every day at ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`, next: null, effect: { type: "daily_checkin", hour: at.getHours(), minute: at.getMinutes() } }
      : { reply: "Sure. What time each day? For example 8 pm.", next: { kind: "mood_time" } };
  }

  const task = TASK_OPEN.exec(said);
  if (task) {
    const rest = clean(task[2]);
    if (!rest) return { reply: "Sure. What's the task?", next: { kind: "task", step: "title", title: "", dueAt: null, remind: false } };
    // A list: "add tasks: buy bread, call mum and pay rent on Friday".
    const many = draftToTasks(rest, [], now);
    if (many.length > 1) {
      const list = many.map((t, i) => `${i + 1}. ${t.task}${t.due ? ` (${t.due === isoDay(now) ? "today" : t.due})` : ""}`).join("\n");
      return { reply: `I heard ${many.length} tasks:\n${list}\nShall I add them all?`, next: { kind: "tasks_confirm", tasks: many } };
    }
    const when = whenFromWords(rest, now);
    const title = cap(clean(when.rest || rest)).slice(0, 200);
    if (!when.at) return askWhen(title);
    const dueAt = when.dayOnly ? new Date(when.at).setHours(9, 0, 0, 0) : when.at.getTime();
    return {
      reply: `Got it: "${title}", ${whenText(dueAt)}. Should I remind you then?`,
      next: { kind: "task", step: "remind", title, dueAt, remind: false },
    };
  }

  const reminder = REMINDER_OPEN.exec(said);
  if (reminder) {
    // "remind me sometime soon" is not a follow-up; "remind me to ..." is.
    if (reminder[1].trim() && !/^(to|about|that|for|of)\b/i.test(reminder[1].trim())) return null;
    const rest = clean(reminder[1]);
    const when = whenFromWords(rest, now);
    const about = clean(when.rest);
    // Full sentences ("remind me to call mum at 6pm") are handled by the direct reminder path.
    if (about && when.at && !when.dayOnly) return null;
    if (!about) return { reply: "Sure. What should I remind you about?", next: { kind: "reminder", step: "text", text: "" } };
    return { reply: `Remind you to ${about}. When? Say a time, like 6 pm or tomorrow at 9.`, next: { kind: "reminder", step: "when", text: about } };
  }

  const mood = moodFromWords(said);
  if (mood) {
    const positive = POSITIVE.has(mood);
    return {
      reply: positive
        ? `That's lovely. I saved ${moodLabel(mood)} for today. What made it good? Say a few words, or say no.`
        : `Thanks for telling me. I saved ${moodLabel(mood)} for today. You don't have to fix everything now. Want to say what's on your mind? Or say no.`,
      next: { kind: "mood_note", positive },
      effect: { type: "log_mood", mood },
    };
  }
  return null;
}

// The answer to the question asked last turn. Null means the words were not an
// answer (a new request instead): the conversation is dropped and they are
// handled as usual.
export function continueFollowUp(p: FollowUp, text: string, now: Date, ctx: FollowUpContext): Turn | null {
  const said = text.trim().replace(/[.!?]+$/, "");
  if (CANCEL.test(said)) return { reply: "Okay, cancelled. Nothing was saved.", next: null };
  // Not an answer: ask once more, then let the words through as a new request.
  const askAgain = (reply: string): Turn | null => (p.again || startFollowUp(said, now, ctx) ? null : { reply, next: { ...p, again: true } });
  // A clear new request ("set an alarm for 7") is never an answer to a time or yes/no question.
  const expectsFreeText = (p.kind === "task" && (p.step === "title" || p.step === "notes")) || (p.kind === "reminder" && p.step === "text") || p.kind === "mood_note";
  if (!expectsFreeText && routeIntent(said) && !YES.test(said) && !NO.test(said)) return null;

  switch (p.kind) {
    case "task": {
      if (p.step === "title") {
        const title = cap(clean(said)).slice(0, 200);
        if (title.length < 2) return { reply: "What's the task? Say it in a few words.", next: p };
        const when = whenFromWords(title, now);
        if (when.at) {
          const dueAt = when.dayOnly ? new Date(when.at).setHours(9, 0, 0, 0) : when.at.getTime();
          const bare = cap(clean(when.rest || title));
          return { reply: `Got it: "${bare}", ${whenText(dueAt)}. Should I remind you then?`, next: { ...p, step: "remind", title: bare, dueAt } };
        }
        return askWhen(title);
      }
      if (p.step === "when") {
        if (NO_TIME.test(said)) return { reply: `No time, so it goes to Sort later. Any details to add? Say them, or say no.`, next: { ...p, step: "notes", dueAt: null } };
        const when = whenFromWords(said, now);
        if (!when.at) return askAgain("I didn't catch the time. Try: tomorrow at 5 pm, Friday, or no time.");
        const dueAt = when.dayOnly ? new Date(when.at).setHours(9, 0, 0, 0) : when.at.getTime();
        return { reply: `${whenText(dueAt)}. Should I remind you then?`, next: { ...p, step: "remind", dueAt } };
      }
      if (p.step === "remind") {
        if (YES.test(said) || NO.test(said)) {
          return { reply: `${YES.test(said) ? "I'll remind you. " : "No reminder. "}Any details to add, like notes or what you need? Say them, or say no.`, next: { ...p, step: "notes", remind: YES.test(said) } };
        }
        return askAgain("Should I remind you at that time? Say yes or no.");
      }
      const notes = NO.test(said) ? null : said.slice(0, 1000);
      return {
        reply: `Saved "${p.title}"${p.dueAt ? `, ${whenText(p.dueAt)}` : " in Sort later"}${p.remind && p.dueAt ? ", with a reminder" : ""}.`,
        next: null,
        effect: { type: "create_task", title: p.title, dueAt: p.dueAt, remind: p.remind && p.dueAt !== null, notes },
      };
    }

    case "schedule_confirm":
      if (YES.test(said)) return { reply: `Done: ${p.items.length} tasks with reminders. You'll see them on their day in Plan.`, next: null, effect: { type: "create_schedule", items: p.items } };
      if (NO.test(said)) return { reply: "Okay, I didn't add them. Say your plan again any time.", next: null };
      return askAgain("Shall I add those plans with reminders? Say yes or no.");

    case "tasks_confirm":
      if (YES.test(said)) return { reply: `Added ${p.tasks.length} tasks. You'll find them in Plan.`, next: null, effect: { type: "create_tasks", tasks: p.tasks } };
      if (NO.test(said)) return { reply: "Okay, I didn't add them. Say the tasks again any time.", next: null };
      return askAgain("Shall I add those tasks? Say yes or no.");

    case "reminder": {
      if (p.step === "text") {
        const about = clean(said);
        if (about.length < 2) return { reply: "What should I remind you about?", next: p };
        return { reply: `Remind you to ${about}. When? Say a time, like 6 pm or tomorrow at 9.`, next: { ...p, step: "when", text: about } };
      }
      const when = whenFromWords(said, now);
      if (!when.at || when.dayOnly) return askAgain("What time? For example 6 pm, or tomorrow at 9 am.");
      if (when.at.getTime() <= now.getTime()) return { reply: "That time has already passed. When should it be?", next: p };
      return { reply: `Reminder set: ${p.text}, ${whenText(when.at.getTime())}.`, next: null, effect: { type: "create_reminder", text: p.text, at: when.at.getTime() } };
    }

    case "mood_note": {
      if (NO.test(said)) return askDailyTime(ctx, "That's okay.");
      return { ...askDailyTime(ctx, p.positive ? "Thanks for sharing. I added it to today's journal." : "Thank you. I added it to today's journal."), effect: { type: "add_mood_note", note: said.slice(0, 2000) } };
    }

    case "mood_time": {
      if (NO.test(said)) return { reply: "Okay. Any time you like, say: ask me how my day was at 8 pm.", next: null };
      const at = parseClock(/\d/.test(said) && !/\b(at|am|pm|:)\b/i.test(said) ? `at ${said}` : said, now);
      if (!at) return askAgain("What time each day? For example 8 pm, or say no.");
      return {
        reply: `Done. I'll ask you how your day was every day at ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.`,
        next: null,
        effect: { type: "daily_checkin", hour: at.getHours(), minute: at.getMinutes() },
      };
    }
  }
}
