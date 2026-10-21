jest.mock("../../llm/llm-engine", () => ({ isLoaded: () => false, generate: jest.fn() }));

import { carryOverTasks, draftToTasks, dueToMs, parseWeeklyReview, weeklyMessages } from "../weekly";
import type { Task } from "../../storage/database";

const NOW = new Date(2026, 9, 19, 9, 0); // Monday 19 Oct 2026, 09:00
const PROJECTS = ["Thesis", "Beginora", "Health"];

function task(id: string, fields: Partial<Task> = {}): Task {
  return {
    id, title: id, firstAction: null, steps: [], reminderId: null, status: "pending", priority: 0,
    dueAt: null, completedAt: null, createdAt: NOW.getTime(), updatedAt: 0, ...fields,
  };
}

describe("parseWeeklyReview", () => {
  test("reads flags, tasks with projects and dates, and a goal update", () => {
    const raw = `Here you go: {"flags":[{"item":"Reorganise the garage","reason":"Not linked to any goal this quarter."}],
      "tasks":[{"project":"thesis","task":"Write the methods section","due":"2026-10-23"},
               {"project":null,"task":"Book the dentist","due":"null"},
               {"project":"Side hustle","task":"Draft the pitch","due":"2026-13-40"}],
      "goalUpdate":"Add a Side hustle project?"}`;
    expect(parseWeeklyReview(raw, PROJECTS, NOW)).toEqual({
      flags: [{ item: "Reorganise the garage", reason: "Not linked to any goal this quarter." }],
      tasks: [
        { project: "Thesis", task: "Write the methods section", due: "2026-10-23" },
        { project: null, task: "Book the dentist", due: null },
        { project: "Side hustle", task: "Draft the pitch", due: null },
      ],
      goalUpdate: "Add a Side hustle project?",
    });
  });

  test("dates in the past or far future are dropped", () => {
    const raw = '{"tasks":[{"task":"A","due":"2020-01-01"},{"task":"B","due":"2030-01-01"}],"flags":[],"goalUpdate":null}';
    expect(parseWeeklyReview(raw, PROJECTS, NOW)?.tasks.map((t) => t.due)).toEqual([null, null]);
  });

  test("broken JSON or no tasks gives null, so the no-AI path takes over", () => {
    expect(parseWeeklyReview("I think your week looks great!", PROJECTS, NOW)).toBeNull();
    expect(parseWeeklyReview('{"tasks":[],"flags":[]}', PROJECTS, NOW)).toBeNull();
  });
});

describe("draftToTasks (no model)", () => {
  test("a spoken draft becomes separate tasks with days and projects", () => {
    const draft = "This week I need to finish the thesis literature review by Friday, call mum, and go for a run on Wednesday. I'll also fix the Beginora login bug tomorrow";
    expect(draftToTasks(draft, PROJECTS, NOW)).toEqual([
      { project: "Thesis", task: "Finish the thesis literature review", due: "2026-10-23" },
      { project: null, task: "Call mum", due: null },
      { project: null, task: "Go for a run", due: "2026-10-21" },
      { project: "Beginora", task: "Fix the Beginora login bug", due: "2026-10-20" },
    ]);
  });

  test("a typed list works too", () => {
    expect(draftToTasks("- Email the supervisor\n- Gym\n- Pay rent on Monday", PROJECTS, NOW).map((t) => [t.task, t.due])).toEqual([
      ["Email the supervisor", null],
      ["Gym", null],
      ["Pay rent", "2026-10-19"],
    ]);
  });
});

test("carry-over is open work from before this week", () => {
  const lastWeek = new Date(2026, 9, 15).getTime();
  const tasks = [task("old-open", { createdAt: lastWeek }), task("old-done", { createdAt: lastWeek, status: "done" }), task("new")];
  expect(carryOverTasks(tasks, NOW).map((t) => t.id)).toEqual(["old-open"]);
});

test("the prompt carries the goals, projects, carry-over and today's date", () => {
  const [system, user] = weeklyMessages("Finish my PhD", PROJECTS, "write chapter 2", ["Old task"], NOW);
  expect(system.content).toContain("2026-10-19");
  expect(user.content).toContain("Finish my PhD");
  expect(user.content).toContain("Thesis, Beginora, Health");
  expect(user.content).toContain("- Old task");
});

test("a due date means 17:00 that day", () => {
  expect(dueToMs("2026-10-23")).toBe(new Date(2026, 9, 23, 17, 0).getTime());
  expect(dueToMs(null)).toBeNull();
});

test("two weekdays in one item make one task on each day", () => {
  expect(draftToTasks("run on Tuesday and Thursday", PROJECTS, NOW)).toEqual([
    { project: null, task: "Run", due: "2026-10-20" },
    { project: null, task: "Run", due: "2026-10-22" },
  ]);
});
