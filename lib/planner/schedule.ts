// Date helpers for the planner: repeating tasks, the week strip and the month
// grid. Pure functions, so they are easy to test.

import type { Repeat, Task } from "../storage/database";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Weeks start on Monday.
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

export function weekDays(d: Date): Date[] {
  const first = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

// Six full weeks covering the month, so the grid never changes height.
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

// The next time a repeating task comes up after `now` (always in the future).
export function nextOccurrence(dueAt: number, repeat: Repeat, now: number): number | null {
  if (repeat === "never") return null;
  let next = new Date(dueAt);
  const step = () => {
    if (repeat === "weekly") next = addDays(next, 7);
    else {
      next = addDays(next, 1);
      if (repeat === "weekdays") while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
    }
  };
  step();
  while (next.getTime() <= now) step();
  return next.getTime();
}

export function tasksOnDay(tasks: Task[], day: Date): Task[] {
  return tasks
    .filter((t) => t.dueAt !== null && sameDay(new Date(t.dueAt), day))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

// Tasks with no time yet: the "sort later" inbox.
export function inboxTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.dueAt === null && t.status !== "done");
}

export function doneToday(tasks: Task[], now: Date): number {
  return tasks.filter((t) => t.completedAt !== null && sameDay(new Date(t.completedAt), now)).length;
}

// "Today", "Tomorrow", or "Wed 22 Oct"; times use the phone's 12/24-hour setting.
export function dayLabel(d: Date, now = new Date()): string {
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, addDays(now, 1))) return "Tomorrow";
  if (sameDay(d, addDays(now, -1))) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function timeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  never: "Never",
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Every week",
};

export const daysBetween = (a: number, b: number) => Math.floor(Math.abs(b - a) / DAY_MS);
