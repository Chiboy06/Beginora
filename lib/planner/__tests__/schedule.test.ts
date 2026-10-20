import { monthGrid, nextOccurrence, weekDays, tasksOnDay, inboxTasks, doneToday, dayLabel } from "../schedule";
import { MOODS } from "../moods";
import { ROUTINE_LIBRARY } from "../routine-library";
import type { Task } from "../../storage/database";

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h, 0).getTime();

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id, title: id, firstAction: null, steps: [], reminderId: null, status: "pending", priority: 0,
    dueAt: null, completedAt: null, createdAt: 0, updatedAt: 0, ...fields,
  };
}

describe("nextOccurrence", () => {
  const tue = at(2026, 9, 20); // Tuesday 20 Oct 2026, 09:00

  test("never repeats", () => {
    expect(nextOccurrence(tue, "never", tue)).toBeNull();
  });

  test("daily moves to the next day at the same time", () => {
    expect(nextOccurrence(tue, "daily", tue)).toBe(at(2026, 9, 21));
  });

  test("weekdays skip the weekend", () => {
    const fri = at(2026, 9, 23);
    expect(nextOccurrence(fri, "weekdays", fri)).toBe(at(2026, 9, 26)); // Monday
  });

  test("weekly adds seven days", () => {
    expect(nextOccurrence(tue, "weekly", tue)).toBe(at(2026, 9, 27));
  });

  test("a task left for days lands in the future, not the past", () => {
    const now = at(2026, 9, 25, 12);
    expect(nextOccurrence(tue, "daily", now)).toBe(at(2026, 9, 26));
  });
});

describe("calendar grids", () => {
  test("the week starts on Monday", () => {
    const days = weekDays(new Date(2026, 9, 22));
    expect(days[0].getDay()).toBe(1);
    expect(days[0].getDate()).toBe(19);
    expect(days).toHaveLength(7);
  });

  test("the month grid has six full weeks and contains the 1st and last day", () => {
    const grid = monthGrid(2026, 1); // February 2026
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(grid.some((d) => d.getMonth() === 1 && d.getDate() === 1)).toBe(true);
    expect(grid.some((d) => d.getMonth() === 1 && d.getDate() === 28)).toBe(true);
  });
});

describe("task lists", () => {
  const now = new Date(2026, 9, 20, 15);
  const tasks = [
    task("late", { dueAt: at(2026, 9, 20, 18) }),
    task("early", { dueAt: at(2026, 9, 20, 8) }),
    task("tomorrow", { dueAt: at(2026, 9, 21) }),
    task("inbox"),
    task("finished", { status: "done", completedAt: at(2026, 9, 20, 10) }),
  ];

  test("a day's tasks are sorted by time", () => {
    expect(tasksOnDay(tasks, now).map((t) => t.id)).toEqual(["early", "late"]);
  });

  test("tasks without a time go to the inbox, done ones do not", () => {
    expect(inboxTasks(tasks).map((t) => t.id)).toEqual(["inbox"]);
  });

  test("done today counts only today's completions", () => {
    expect(doneToday(tasks, now)).toBe(1);
  });

  test("day labels", () => {
    expect(dayLabel(new Date(2026, 9, 21), now)).toBe("Tomorrow");
    expect(dayLabel(new Date(2026, 9, 20), now)).toBe("Today");
  });
});

test("moods have unique keys and every mood has a word", () => {
  expect(new Set(MOODS.map((m) => m.key)).size).toBe(MOODS.length);
  expect(new Set(MOODS.map((m) => m.label)).size).toBe(MOODS.length);
  for (const m of MOODS) expect(m.label.length).toBeGreaterThan(0);
});

test("every library routine has short, timed steps", () => {
  for (const r of ROUTINE_LIBRARY) {
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) expect(s.minutes).toBeGreaterThan(0);
  }
});

test("routine steps are read one per line, minutes at the end", () => {
  const { parseSteps } = jest.requireActual("../routine-library");
  expect(parseSteps("Snack 10\nHomework - 25 min\n\nPack bag")).toEqual([
    { title: "Snack", minutes: 10 },
    { title: "Homework", minutes: 25 },
    { title: "Pack bag", minutes: 5 },
  ]);
});
