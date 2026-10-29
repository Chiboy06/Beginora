// Keeps the follow-up question between turns and carries out what each answer
// saves. Used by processMessage, so typing, the microphone and hands-free
// voice all get the same questions.

import { continueFollowUp, startFollowUp, type Effect, type FollowUp } from "./followup";
import { isCrisis } from "../ai/decomposer";
import { prefs } from "../store/prefs";
import { dueToMs } from "../planner/weekly";

// One question at a time for the one chat; a new app start begins fresh.
let pending: FollowUp | null = null;

export function clearFollowUp(): void {
  pending = null;
}

export function hasFollowUp(): boolean {
  return pending !== null;
}

// The reply for this turn, or null when the words are not part of a follow-up.
export async function runFollowUp(text: string, now: Date): Promise<string | null> {
  if (isCrisis(text)) {
    pending = null;
    return null;
  }
  const ctx = { dailyCheckInSet: prefs.moodCheckIn.enabled };
  let turn = pending ? continueFollowUp(pending, text, now, ctx) : null;
  if (!turn) turn = startFollowUp(text, now, ctx);
  if (!turn) {
    pending = null;
    return null;
  }
  pending = turn.next;
  if (!turn.effect) return turn.reply;
  try {
    const extra = await apply(turn.effect);
    return extra ? `${turn.reply} ${extra}` : turn.reply;
  } catch {
    pending = null;
    return "Sorry, I couldn't save that just now. Please try again.";
  }
}

// Loaded when needed, so the chat path does not pull in storage and native
// modules until something is saved.
async function apply(effect: Effect): Promise<string | null> {
  switch (effect.type) {
    case "create_task": {
      const { useTaskStore } = await import("../store/task-store");
      const { decompose } = await import("../ai/decomposer");
      const store = useTaskStore.getState();
      const task = await store.addTask(effect.title, { dueAt: effect.dueAt, remind: effect.remind, notes: effect.notes });
      const plan = await decompose(effect.title).catch(() => null);
      if (plan && plan.source !== "safety_block") {
        await store.setPlan(task.id, plan.firstAction, plan.steps).catch(() => {});
        return `First small step: ${plan.firstAction}`;
      }
      return null;
    }
    case "create_tasks": {
      const { useTaskStore } = await import("../store/task-store");
      for (const t of effect.tasks) await useTaskStore.getState().addTask(t.task, { dueAt: dueToMs(t.due) });
      return null;
    }
    case "create_schedule": {
      const { useTaskStore } = await import("../store/task-store");
      // Times already gone stay as tasks without a reminder.
      for (const i of effect.items) await useTaskStore.getState().addTask(i.title, { dueAt: i.at, remind: i.at > Date.now() });
      return null;
    }
    case "create_reminder": {
      const { scheduleLocalReminder } = await import("../native/reminders");
      const r = await scheduleLocalReminder(effect.text, new Date(effect.at).toISOString());
      return r.success ? null : r.message;
    }
    case "log_mood": {
      const { saveJournalEntry } = await import("../storage/database");
      const { v4: uuid } = await import("uuid");
      await saveJournalEntry({ id: uuid(), mood: effect.mood, title: null, body: null, tags: [], createdAt: Date.now() });
      return null;
    }
    case "add_mood_note": {
      const { getJournalEntries, saveJournalEntry } = await import("../storage/database");
      const { startOfDay } = await import("../planner/schedule");
      const latest = (await getJournalEntries(startOfDay(new Date()).getTime())).find((e) => e.mood);
      if (latest) await saveJournalEntry({ ...latest, body: [latest.body, effect.note].filter(Boolean).join("\n") });
      return null;
    }
    case "daily_checkin":
    case "daily_checkin_off": {
      const { setMoodCheckIn } = await import("../planner/mood-checkin");
      const r = await setMoodCheckIn(effect.type === "daily_checkin", effect.type === "daily_checkin" ? effect.hour : 20, effect.type === "daily_checkin" ? effect.minute : 0);
      return r.ok ? null : r.message;
    }
  }
}
