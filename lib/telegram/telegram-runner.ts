// Starts and stops the two-way Telegram bot inside the app process. It keeps
// running while the app is in the background; the optional background service
// keeps that process alive when the phone would otherwise freeze it.

import { decompose } from "../ai/decomposer";
import { getTasks } from "../storage/database";
import { prefs } from "../store/prefs";
import { useTaskStore } from "../store/task-store";
import { runBotLoop } from "./telegram-bot";
import { handleCommand, type CommandDeps } from "./telegram-commands";
import { getTelegramConfig } from "./telegram-service";
import { relayInbox, relaySend } from "./relay-client";

// The relay keeps messages until the phone asks, so a short poll is enough.
const RELAY_POLL_MS = 15_000;

// Each start bumps the generation, so an earlier loop still waiting on a long
// poll exits instead of running alongside the new one.
let generation = 0;
let activeGeneration: number | null = null;

const appCommands: CommandDeps = {
  plan: decompose,
  openTasks: async () =>
    (await getTasks())
      .filter((task) => task.status !== "done")
      .sort((a, b) => b.updatedAt - a.updatedAt),
  addTask: (title, firstAction, steps) =>
    useTaskStore.getState().createTaskWithPlan(title, firstAction, steps),
  replan: async (taskId, firstAction, steps) => {
    await useTaskStore.getState().setPlan(taskId, firstAction, steps);
    await useTaskStore.getState().recordOutcome(taskId, "retried");
  },
  complete: (taskId) => useTaskStore.getState().setStatusWithOutcome(taskId, "done", "completed"),
};

export function isTelegramBotRunning(): boolean {
  return activeGeneration !== null;
}

// Shared Beginora bot: fetch what the user wrote, answer through the relay.
async function runRelayLoop(isRunning: () => boolean): Promise<void> {
  let failures = 0;
  while (isRunning()) {
    try {
      for (const text of await relayInbox()) {
        let reply: string;
        try {
          reply = await handleCommand(text, appCommands);
        } catch {
          reply = "Something went wrong on the phone. Please try again in a moment.";
        }
        await relaySend(reply);
      }
      failures = 0;
    } catch {
      failures += 1;
      // Not connected any more: stop instead of retrying forever.
      if (!prefs.telegramRelayLinked) return;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(120_000, RELAY_POLL_MS * 2 ** failures)));
  }
}

export async function startTelegramBot(): Promise<boolean> {
  if (prefs.telegramTwoWay && prefs.telegramRelayLinked) {
    if (activeGeneration !== null) return true;
    const mine = ++generation;
    activeGeneration = mine;
    void runRelayLoop(() => activeGeneration === mine)
      .catch((err) => console.warn("[telegram] relay loop stopped:", err instanceof Error ? err.message : err))
      .finally(() => { if (activeGeneration === mine) activeGeneration = null; });
    return true;
  }
  const cfg = await getTelegramConfig();
  if (!prefs.telegramTwoWay || !cfg.enabled || !cfg.botToken || !cfg.chatId) return false;
  if (activeGeneration !== null) return true;

  const mine = ++generation;
  activeGeneration = mine;
  void runBotLoop(
    {
      fetch,
      token: cfg.botToken,
      chatId: cfg.chatId,
      loadOffset: async () => prefs.telegramOffset,
      saveOffset: async (offset) => { prefs.telegramOffset = offset; },
      handle: (text) => handleCommand(text, appCommands),
    },
    {
      isRunning: () => activeGeneration === mine,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  )
    .catch((err) => console.warn("[telegram] bot stopped:", err instanceof Error ? err.message : err))
    .finally(() => {
      if (activeGeneration === mine) activeGeneration = null;
    });
  return true;
}

export function stopTelegramBot(): void {
  activeGeneration = null;
}
