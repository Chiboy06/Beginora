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

// Saved after the goals, like the instructions at the bottom of a CLAUDE.md:
// how the weekly plan is checked. The user can edit it in My goals.
export const DEFAULT_GUIDE = `Each week I'll bring you a rough draft of my plan. Check it against my goals and flag anything that doesn't move them forward, but don't nitpick. Then turn the plan into tasks with a project, a task and a due date. Keep new tasks apart from tasks carrying over from last week. Put each task in the right project, and only add a due date if the task is genuinely time-sensitive. Once I approve the tasks, create them all at once without confirming each one. If I mention a new project or a change to my goals, suggest an update to my goals, and check with me before you save it.`;

// The routine's only job, as in the guide's weekly check-in instructions.
export const CHECK_IN_QUESTION = "What's your plan for the week? Let's check it against your goals.";

export function weeklyMessages(goals: string, projects: string[], draft: string, carry: string[], now: Date, guide = DEFAULT_GUIDE): CompletionMessage[] {
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return [
    {
      role: "system",
      content: `You help a person with ADHD plan their week. Today is ${today} (${isoDay(now)}).
Their planning guide, follow it:
${(guide.trim() || DEFAULT_GUIDE).slice(0, 2000)}
Rules for your answer: flag at most 3 items, kindly and briefly. Each task is short and starts with a verb. Use a project from their list when one fits, or null. A due date (YYYY-MM-DD) only when the plan names a day or deadline. Do not repeat the tasks already carrying over. goalUpdate is one sentence, or null.
Reply with ONLY this JSON, no other text:
{"flags":[{"item":"...","reason":"..."}],"tasks":[{"project":"... or null","task":"...","due":"YYYY-MM-DD or null"}],"goalUpdate":"... or null"}`,
    },
    {
      role: "user",
      content: `My goals:\n${goals.trim() || "(none written yet)"}\n\nMy projects: ${projects.length ? projects.join(", ") : "(none yet)"}\n\nAlready carrying over from last week:\n${carry.length ? carry.map((t) => `- ${t}`).join("\n") : "(nothing)"}\n\nMy rough plan for this week:\n${draft.trim()}`,
    },
  ];
}

// "Summarise this and add it to my goals": the dictated goals, tidied.
export function summaryMessages(raw: string): CompletionMessage[] {
  return [
    {
      role: "system",
      content: `Summarise what the person said about their goals. Keep their meaning and their words where you can; do not add goals they did not say.
Write three short sections with these exact headings:
Goals: (yearly or quarterly goals, one per line starting with "- ")
Projects: (one per line starting with "- ")
How I work: (one per line starting with "- ")
Reply with ONLY this JSON, no other text:
{"summary":"the three sections as plain text","projects":["short project name", "..."]}`,
    },
    { role: "user", content: raw.trim().slice(0, 6000) },
  ];
}

export function parseSummary(raw: string): { summary: string; projects: string[] } | null {
  let data: any;
  try {
    data = parseLooseJson(raw);
  } catch {
    return null;
  }
  const summary = typeof data?.summary === "string" ? data.summary.trim().slice(0, 4000) : "";
  if (summary.length < 10) return null;
  const projects = (Array.isArray(data?.projects) ? data.projects : [])
    .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p: string) => p.trim().slice(0, 40))
    .slice(0, 20);
  return { summary, projects };
}

// Models often put real line breaks inside JSON strings, which JSON.parse
// rejects. Escape them, only inside strings, and try again.
export function parseLooseJson(raw: string): unknown {
  try {
    return extractJsonObject(raw);
  } catch {
    let out = "";
    let inString = false;
    let escaped = false;
    for (const ch of raw) {
      if (inString && !escaped && (ch === "\n" || ch === "\r")) {
        out += ch === "\n" ? "\\n" : "";
        continue;
      }
      if (ch === '"' && !escaped) inString = !inString;
      escaped = ch === "\\" && !escaped;
      out += ch;
    }
    return extractJsonObject(out);
  }
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
    data = parseLooseJson(raw);
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

// Plain text for the share sheet, so the plan can go into any other task app
// (Todoist, Google Tasks, Linear ...), grouped by project.
export function planAsText(rows: PlannedTask[], carry: string[]): string {
  const byProject = new Map<string, PlannedTask[]>();
  for (const r of rows.filter((r) => r.task.trim())) {
    const key = r.project ?? "No project";
    byProject.set(key, [...(byProject.get(key) ?? []), r]);
  }
  const parts = [...byProject].map(([project, items]) =>
    `${project}\n${items.map((r) => `- ${r.task.trim()}${r.due ? ` (due ${r.due})` : ""}`).join("\n")}`);
  if (carry.length) parts.push(`Carrying over\n${carry.map((t) => `- ${t}`).join("\n")}`);
  return `My week\n\n${parts.join("\n\n")}`;
}
