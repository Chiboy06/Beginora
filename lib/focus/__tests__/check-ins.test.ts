jest.mock("../../storage/database", () => ({ getTaskOutcomes: jest.fn() }));

import { isQuietHour, pickCheckIn, pruneNudgeLog, type CheckInInput } from "../check-ins";
import type { Task, TaskOutcomeRecord } from "../../storage/database";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 15:00 local time, outside the default quiet hours.
const NOW = new Date(2026, 9, 20, 15, 0, 0).getTime();

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Essay",
  firstAction: "Open the document",
  steps: [],
  reminderId: null,
  status: "pending",
  priority: 0,
  dueAt: null,
  completedAt: null,
  createdAt: NOW - HOUR,
  updatedAt: NOW - HOUR,
  ...over,
});

const outcome = (taskId: string, kind: TaskOutcomeRecord["outcome"], i: number): TaskOutcomeRecord => ({
  id: i,
  taskId,
  outcome: kind,
  createdAt: NOW - i * HOUR,
});

const input = (over: Partial<CheckInInput> = {}): CheckInInput => ({
  now: NOW,
  tasks: [],
  outcomes: {},
  lastNudgeAt: {},
  drift: false,
  ...over,
});

describe("quiet hours", () => {
  test("a window crossing midnight covers late night and early morning", () => {
    expect(isQuietHour(new Date(2026, 0, 1, 23, 0))).toBe(true);
    expect(isQuietHour(new Date(2026, 0, 1, 2, 0))).toBe(true);
    expect(isQuietHour(new Date(2026, 0, 1, 8, 0))).toBe(false);
    expect(isQuietHour(new Date(2026, 0, 1, 21, 59))).toBe(false);
  });

  test("a same-day window works too", () => {
    expect(isQuietHour(new Date(2026, 0, 1, 13, 0), 12, 14)).toBe(true);
    expect(isQuietHour(new Date(2026, 0, 1, 14, 0), 12, 14)).toBe(false);
  });

  test("no check-in is picked during quiet hours", () => {
    const night = new Date(2026, 9, 20, 23, 30).getTime();
    const stuck = task({ createdAt: night - 2 * DAY });
    expect(pickCheckIn(input({ now: night, tasks: [stuck] }))).toBeNull();
  });
});

test("three stuck outcomes in a row trigger a paralysis check-in", () => {
  const t = task();
  const result = pickCheckIn(input({
    tasks: [t],
    outcomes: { t1: [outcome("t1", "snoozed", 1), outcome("t1", "wrong_moment", 2), outcome("t1", "stopped", 3)] },
  }));
  expect(result).toMatchObject({ taskId: "t1", reason: "paralysis" });
});

test("a task active for over 90 minutes triggers a hyperfocus check-in first", () => {
  const active = task({ id: "a", status: "active", updatedAt: NOW - 2 * HOUR });
  const stuck = task({ id: "s" });
  const result = pickCheckIn(input({
    tasks: [stuck, active],
    outcomes: { s: [outcome("s", "snoozed", 1), outcome("s", "snoozed", 2), outcome("s", "snoozed", 3)] },
  }));
  expect(result).toMatchObject({ taskId: "a", reason: "hyperfocus" });
});

test("drift nudges the most recent task that has a first step", () => {
  const older = task({ id: "old", updatedAt: NOW - 5 * HOUR });
  const newer = task({ id: "new", updatedAt: NOW - HOUR });
  const noStep = task({ id: "none", firstAction: null, updatedAt: NOW });
  expect(pickCheckIn(input({ tasks: [older, noStep, newer], drift: true }))).toMatchObject({ taskId: "new", reason: "drift" });
});

test("a planned task untouched for a day gets one gentle nudge", () => {
  const t = task({ createdAt: NOW - 25 * HOUR });
  expect(pickCheckIn(input({ tasks: [t] }))).toMatchObject({ reason: "untouched", body: expect.stringContaining("Open the document") });
});

test("a task touched or created recently is left alone", () => {
  const fresh = task({ createdAt: NOW - 2 * HOUR });
  const started = task({ id: "t2", createdAt: NOW - 3 * DAY });
  expect(pickCheckIn(input({ tasks: [fresh, started], outcomes: { t2: [outcome("t2", "started", 1)] } }))).toBeNull();
});

test("a task nudged in the last 24 hours is not nudged again", () => {
  const t = task({ createdAt: NOW - 3 * DAY });
  expect(pickCheckIn(input({ tasks: [t], lastNudgeAt: { t1: NOW - 23 * HOUR } }))).toBeNull();
  expect(pickCheckIn(input({ tasks: [t], lastNudgeAt: { t1: NOW - 25 * HOUR } }))).not.toBeNull();
});

test("done tasks are never nudged", () => {
  const t = task({ status: "done", createdAt: NOW - 3 * DAY });
  expect(pickCheckIn(input({ tasks: [t], drift: true }))).toBeNull();
});

test("the nudge log drops entries older than a week", () => {
  expect(pruneNudgeLog({ a: NOW - 8 * DAY, b: NOW - DAY }, NOW)).toEqual({ b: NOW - DAY });
});
