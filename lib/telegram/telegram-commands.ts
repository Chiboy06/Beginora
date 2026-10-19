// Turns a Telegram message into a reply. Only planning and task actions are
// reachable from Telegram: calls, SMS, email, calendar and contacts stay in the
// app behind its confirmation step.

import type { DecompositionResult } from "../ai/decomposer";
import type { Task } from "../storage/database";

export interface CommandDeps {
  plan(task: string, context?: string): Promise<DecompositionResult>;
  // Open tasks, most recently updated first.
  openTasks(): Promise<Task[]>;
  addTask(title: string, firstAction: string, steps: string[]): Promise<Task>;
  replan(taskId: string, firstAction: string, steps: string[]): Promise<void>;
  complete(taskId: string): Promise<void>;
}

export const HELP_TEXT = [
  "Beginora helps you start. Send:",
  "/add <task> - save a task and get a first step",
  "/next - your current task and its first step",
  "/stuck - a smaller first step for the current task",
  "/done - mark the current task as done",
  "Or just tell me what you need to start, and I'll suggest a first step.",
].join("\n");

const MAX_TASK_CHARS = 200;

function describe(result: DecompositionResult): string {
  if (result.source === "safety_block") return result.firstAction;
  const next = result.steps.slice(0, 3).map((step, i) => `${i + 1}. ${step}`);
  return [`First step: ${result.firstAction}`, ...(next.length ? ["", "Then:", ...next] : [])].join("\n");
}

export async function handleCommand(text: string, deps: CommandDeps): Promise<string> {
  const match = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text.trim());
  const command = match?.[1].toLowerCase();
  const arg = (match ? match[2] : text).trim().slice(0, MAX_TASK_CHARS);

  switch (command) {
    case "start":
    case "help":
      return HELP_TEXT;

    case "add": {
      if (!arg) return "Tell me the task, for example: /add write my essay intro";
      const result = await deps.plan(arg);
      if (result.source === "safety_block") return result.firstAction;
      await deps.addTask(arg, result.firstAction, result.steps);
      return `Saved "${arg}".\n${describe(result)}\n\nYou can stop after five minutes. Send /done when it's finished.`;
    }

    case "next": {
      const [task] = await deps.openTasks();
      if (!task) return "No open tasks. Send /add <task> to save one.";
      return task.firstAction
        ? `Current task: ${task.title}\nFirst step: ${task.firstAction}`
        : `Current task: ${task.title}\nSend /stuck and I'll suggest a first step.`;
    }

    case "stuck": {
      const [task] = await deps.openTasks();
      if (!task) return "No open tasks. Tell me what you need to start and I'll suggest a first step.";
      const context = task.firstAction
        ? `The step "${task.firstAction}" felt too big. Suggest a smaller, easier first step.`
        : undefined;
      const result = await deps.plan(task.title, context);
      if (result.source === "safety_block") return result.firstAction;
      await deps.replan(task.id, result.firstAction, result.steps);
      return `Let's make it smaller.\n${describe(result)}`;
    }

    case "done": {
      const [task] = await deps.openTasks();
      if (!task) return "No open tasks right now.";
      await deps.complete(task.id);
      return `Marked "${task.title}" as done. Nice work.`;
    }

    case undefined: {
      if (!arg) return HELP_TEXT;
      const result = await deps.plan(arg);
      if (result.source === "safety_block") return result.firstAction;
      return `${describe(result)}\n\nSend /add ${arg} to save it as a task.`;
    }

    default:
      return HELP_TEXT;
  }
}
