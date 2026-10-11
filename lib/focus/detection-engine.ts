// Passive focus detection engine.
// Reads task outcome history and scores two signals:
//   paralysis  — the user is stuck: repeated snooze/wrong_moment/stopped with no completion
//   hyperfocus — the user may have lost track of time: session extended many times or active >90 min
//
// No background process. No screen monitoring. No passive data collection.
// Called explicitly from the focus screen and task detail screen.
// Returns a typed signal + a calm, non-judgmental nudge message.

import { getTaskOutcomes } from "../storage/database";
import type { TaskOutcomeRecord } from "../storage/database";

export type FocusSignal =
  | { kind: "none" }
  | { kind: "paralysis"; message: string; suggestion: string }
  | { kind: "hyperfocus"; message: string; suggestion: string };

// How long a task can be "active" before we gently check in (90 minutes).
const HYPERFOCUS_ACTIVE_MS = 90 * 60 * 1000;

// How many consecutive non-completion outcomes trigger a paralysis signal.
const PARALYSIS_THRESHOLD = 3;

// Outcomes that indicate the user is not moving forward.
const STUCK_OUTCOMES = new Set<TaskOutcomeRecord["outcome"]>([
  "snoozed",
  "wrong_moment",
  "stopped",
]);

export interface FocusContext {
  taskId: string;
  // When the task was last set to "active" (ms epoch). Pass Date.now() if unknown.
  activeStartedAt: number;
  // How many times the user has extended the current focus session (tapped "Continue for 5 min").
  extensionCount: number;
}

export async function detectFocusSignal(ctx: FocusContext): Promise<FocusSignal> {
  try {
    const outcomes = await getTaskOutcomes(ctx.taskId, 20);
    return score(ctx, outcomes);
  } catch {
    return { kind: "none" };
  }
}

function score(ctx: FocusContext, outcomes: TaskOutcomeRecord[]): FocusSignal {
  // Hyperfocus check — time-based, no outcome history needed.
  const activeMs = Date.now() - ctx.activeStartedAt;
  if (activeMs >= HYPERFOCUS_ACTIVE_MS || ctx.extensionCount >= 3) {
    return {
      kind: "hyperfocus",
      message: "You've been at this for a while.",
      suggestion: "It's okay to take a break. You can come back to this whenever you're ready.",
    };
  }

  // Paralysis check — outcomes are newest first. Ignore this focus session's
  // own `started` marker, then count prior stuck outcomes until a reset point.
  let stuckRun = 0;
  let skippedCurrentStart = false;
  for (const o of outcomes) {
    if (o.outcome === "started" && !skippedCurrentStart) {
      skippedCurrentStart = true;
      continue;
    }
    if (o.outcome === "completed" || o.outcome === "started" || o.outcome === "retried") break;
    if (STUCK_OUTCOMES.has(o.outcome)) stuckRun++;
  }

  if (stuckRun >= PARALYSIS_THRESHOLD) {
    return {
      kind: "paralysis",
      message: "This one seems hard to get into.",
      suggestion: "Would a different first step help? You can ask for another one, or set this aside for now.",
    };
  }

  return { kind: "none" };
}
