// Weekly planning: the user talks through a rough plan, it is checked against
// their goals, turned into project / task / due-date rows, and created once
// approved. Pure functions here; lib/planner/weekly-ai.ts picks the model.

import type { CompletionMessage } from "../llm/llm-engine";
import type { Task } from "../storage/database";
import { extractJsonObject } from "../ai/decomposer";
import { captureFrom } from "../orchestrator/direct-actions";
import { addDays, startOfDay, startOfWeek } from "./schedule";

export interface PlannedTask {
  project: string | null;
  task: string;
  // "YYYY-MM-DD", only when the plan says a day or deadline.
  due: string | null;
}

export interface GoalFlag {
  item: string;
  reason: string;
}

export interface WeeklyReview {
  flags: GoalFlag[];
  tasks: PlannedTask[];
  // A suggested change to the goals (a new project, a changed goal); saved only if the user agrees.
  goalUpdate: string | null;
  source: "online" | "phone" | "rules";
}

const MAX_TASKS = 25;
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Open tasks from before this week: shown apart, as in "carrying over".
export function carryOverTasks(tasks: Task[], now: Date): Task[] {
  const monday = startOfWeek(now).getTime();
  return tasks.filter((t) => t.status !== "done" && t.createdAt < monday);
}

export function weeklyMessages(goals: string, projects: string[], draft: string, carry: string[], now: Date): CompletionMessage[] {
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return [
    {
      role: "system",
      content: `You help a person with ADHD plan their week. Today is ${today} (${isoDay(now)}).
1. Check their rough plan against their goals. Flag only items that clearly do not move any goal forward, at most 3, kindly and briefly. Do not nitpick.
2. Turn the plan into short tasks, each starting with a verb. Put each task in the best matching project from their list, or null.
3. Add a due date (YYYY-MM-DD) only if the plan names a day or deadline for that task. Otherwise null.
4. Do not repeat the tasks that are already carrying over.
5. If they mention a new project or a change to their goals, write one sentence suggesting the update. Otherwise null.
Reply with ONLY this JSON, no other text:
{"flags":[{"item":"...","reason":"..."}],"tasks":[{"project":"... or null","task":"...","due":"YYYY-MM-DD or null"}],"goalUpdate":"... or null"}`,
    },
    {
      role: "user",
      content: `My goals:\n${goals.trim() || "(none written yet)"}\n\nMy projects: ${projects.length ? projects.join(", ") : "(none yet)"}\n\nAlready carrying over from last week:\n${carry.length ? carry.map((t) => `- ${t}`).join("\n") : "(nothing)"}\n\nMy rough plan for this week:\n${draft.trim()}`,
    },
  ];
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !/^null$/i.test(v.trim()) ? v.trim().slice(0, max) : null);

function matchProject(name: string | null, projects: string[]): string | null {
  if (!name) return null;
  return projects.find((p) => p.toLowerCase() === name.toLowerCase()) ?? name.slice(0, 40);
}

// A due date the model gave, kept only if it is a real day from yesterday to four months out.
function validDue(v: unknown, now: Date): string | null {
  const s = str(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime()) || isoDay(d) !== s) return null;
  return d >= addDays(startOfDay(now), -1) && d <= addDays(now, 120) ? s : null;
}

// The model's JSON, checked field by field. Null when there is nothing usable.
export function parseWeeklyReview(raw: string, projects: string[], now: Date): Omit<WeeklyReview, "source"> | null {
  let data: any;
  try {
    data = extractJsonObject(raw);
  } catch {
    return null;
  }
  const tasks: PlannedTask[] = (Array.isArray(data?.tasks) ? data.tasks : [])
    .map((t: any) => ({ project: matchProject(str(t?.project, 40), projects), task: str(t?.task, 200) ?? "", due: validDue(t?.due, now) }))
    .filter((t: PlannedTask) => t.task)
    .slice(0, MAX_TASKS);
  if (tasks.length === 0) return null;
  const flags: GoalFlag[] = (Array.isArray(data?.flags) ? data.flags : [])
    .map((f: any) => ({ item: str(f?.item, 200) ?? "", reason: str(f?.reason, 300) ?? "" }))
    .filter((f: GoalFlag) => f.item && f.reason)
    .slice(0, 3);
  return { flags, tasks, goalUpdate: str(data?.goalUpdate, 600) };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY = new RegExp(`\\b(?:on|by|before|this|next)?\\s*(${WEEKDAYS.join("|")})\\b`, "i");

// "Friday" means the coming Friday (today if it is Friday).
function nextWeekday(name: string, now: Date): Date {
  const target = WEEKDAYS.indexOf(name.toLowerCase());
  return addDays(startOfDay(now), (target - now.getDay() + 7) % 7);
}

const FILLER = /^(?:(?:and|also|then|so|plus)\s+)*(?:(?:this week,?\s*)?(?:i(?:'ll| will| need to| have to| want to| must| should| plan to| am going to|'m going to)|need to|have to|want to|going to|gotta|plan to)\s+)?(?:(?:also|just|then|really)\s+)?/i;

// No model: split the spoken draft into tasks and read days from the words.
export function draftToTasks(draft: string, projects: string[], now: Date): PlannedTask[] {
  return draft
    .split(/\n|;|\.\s+|,\s*(?:and\s+)?|\s+and then\s+/i)
    .map((piece) => piece.replace(/^[\s\-*•\d.)]+/, "").replace(FILLER, "").trim())
    .filter((piece) => piece.length >= 3)
    .flatMap((piece) => {
      // "run on Tuesday and Thursday" is one task on each day.
      const days = [...piece.matchAll(new RegExp(WEEKDAY.source, "gi"))].map((m) => m[1]);
      const withoutDays = piece.replace(new RegExp(`(?:\\s*(?:,|and)\\s*)?${WEEKDAY.source}`, "gi"), " ");
      const capture = captureFrom(days.length ? withoutDays : piece, now);
      const title = capture.title.replace(/\s{2,}/g, " ").replace(/[\s,.]+$/, "").replace(/^[a-z]/, (c) => c.toUpperCase()).slice(0, 200);
      const project = projects.find((p) => piece.toLowerCase().includes(p.toLowerCase())) ?? null;
      const dates = days.length ? days.map((d) => nextWeekday(d, now)) : [capture.at ?? capture.day];
      return dates.map((when) => ({ project, task: title, due: when ? isoDay(when) : null }));
    })
    .filter((t) => t.task.length >= 3)
    .slice(0, MAX_TASKS);
}

// Due dates become 17:00 that day: "by the end of the day", not an appointment.
export const dueToMs = (due: string | null) => (due ? new Date(`${due}T17:00:00`).getTime() : null);
