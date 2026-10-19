// Gentle check-ins: decides whether to send one calm nudge, and for which task.
// Pure, so the rules are unit-tested; lib/focus/check-in-runner.ts gathers the
// data and shows the notification.

import type { Task, TaskOutcomeRecord } from "../storage/database";
import { score } from "./detection-engine";

export type CheckInReason = "hyperfocus" | "paralysis" | "drift" | "untouched";

export interface CheckIn {
  taskId: string;
  reason: CheckInReason;
  title: string;
  body: string;
}

export interface CheckInInput {
  now: number;
  tasks: Task[];
  // Outcomes per task id, newest first.
  outcomes: Record<string, TaskOutcomeRecord[]>;
  // When each task was last nudged (ms epoch).
  lastNudgeAt: Record<string, number>;
  // Screen-pattern drift detected (lib/focus/usage-signals.ts); false when off.
  drift: boolean;
  quietStartHour?: number;
  quietEndHour?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY: CheckInReason[] = ["hyperfocus", "paralysis", "drift", "untouched"];

// True inside quiet hours; handles windows that cross midnight (22 to 8).
export function isQuietHour(date: Date, startHour = 22, endHour = 8): boolean {
  const hour = date.getHours();
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}

function firstStepLine(task: Task): string {
  return task.firstAction ? `${task.title}: ${task.firstAction}` : task.title;
}

function reasonFor(task: Task, input: CheckInInput): CheckIn | null {
  const outcomes = input.outcomes[task.id] ?? [];
  const signal = score(
    {
      taskId: task.id,
      // Only a task marked active can be in hyperfocus; others score as just started.
      activeStartedAt: task.status === "active" ? task.updatedAt : input.now,
      extensionCount: 0,
    },
    outcomes,
    input.now,
  );
  if (signal.kind === "hyperfocus" || signal.kind === "paralysis") {
    return { taskId: task.id, reason: signal.kind, title: signal.message, body: `${task.title}. ${signal.suggestion}` };
  }
  if (input.drift && task.firstAction) {
    return {
      taskId: task.id,
      reason: "drift",
      title: "Want to try five minutes?",
      body: `${firstStepLine(task)}. You can stop after five minutes.`,
    };
  }
  if (task.firstAction && outcomes.length === 0 && input.now - task.createdAt >= DAY_MS) {
    return {
      taskId: task.id,
      reason: "untouched",
      title: "Ready when you are",
      body: `${firstStepLine(task)}. You can stop after five minutes.`,
    };
  }
  return null;
}

export function pickCheckIn(input: CheckInInput): CheckIn | null {
  if (isQuietHour(new Date(input.now), input.quietStartHour, input.quietEndHour)) return null;
  const candidates = input.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => input.now - (input.lastNudgeAt[task.id] ?? 0) >= DAY_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((task) => reasonFor(task, input))
    .filter((checkIn): checkIn is CheckIn => checkIn !== null);
  candidates.sort((a, b) => PRIORITY.indexOf(a.reason) - PRIORITY.indexOf(b.reason));
  return candidates[0] ?? null;
}

// Drops log entries older than a week so the stored map cannot grow forever.
export function pruneNudgeLog(log: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(log).filter(([, at]) => now - at < 7 * DAY_MS));
}
