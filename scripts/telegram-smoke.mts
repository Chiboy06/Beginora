// Real-bot smoke test: runs the app's own Telegram loop and command handler
// against the real Telegram Bot API, with in-memory tasks and the offline rule
// engine as the planner. Use a separate test bot, never the phone's bot: two
// pollers on one token would split the messages between them.
//
//   TELEGRAM_TEST_TOKEN=... TELEGRAM_TEST_CHAT_ID=... node scripts/telegram-smoke.mts [minutes]
//
// Then message the bot: /start, /add write my essay, /next, /stuck, /done, and
// a message from a second account (must get no reply).

import { runBotLoop } from "../lib/telegram/telegram-bot.ts";
import { handleCommand, type CommandDeps } from "../lib/telegram/telegram-commands.ts";
import { getRuleEngineAction } from "../lib/ai/rule-engine.ts";
import type { Task } from "../lib/storage/database.ts";

const token = process.env.TELEGRAM_TEST_TOKEN?.trim();
const chatId = process.env.TELEGRAM_TEST_CHAT_ID?.trim();
if (!token || !chatId) {
  console.error("Set TELEGRAM_TEST_TOKEN and TELEGRAM_TEST_CHAT_ID (a test bot, not the phone's bot).");
  process.exit(2);
}

const minutes = Number(process.argv[2] ?? 3);
const tasks: Task[] = [];
let offset = 0;
let handled = 0;

const deps: CommandDeps = {
  plan: async (task) => ({ ...getRuleEngineAction(task), source: "rule_engine" }),
  openTasks: async () => tasks.filter((t) => t.status !== "done").sort((a, b) => b.updatedAt - a.updatedAt),
  addTask: async (title, firstAction, steps) => {
    const now = Date.now();
    const task: Task = {
      id: String(tasks.length + 1), title, firstAction, steps, reminderId: null, status: "pending",
      priority: 0, dueAt: null, completedAt: null, createdAt: now, updatedAt: now,
    };
    tasks.push(task);
    return task;
  },
  replan: async (id, firstAction, steps) => {
    Object.assign(tasks.find((t) => t.id === id) ?? {}, { firstAction, steps, updatedAt: Date.now() });
  },
  complete: async (id) => {
    Object.assign(tasks.find((t) => t.id === id) ?? {}, { status: "done", completedAt: Date.now() });
  },
};

const stopAt = Date.now() + minutes * 60_000;
console.log(`Polling for ${minutes} min. Message your test bot now.`);
await runBotLoop(
  {
    fetch,
    token,
    chatId,
    loadOffset: async () => offset,
    saveOffset: async (n) => { offset = n; },
    handle: async (text) => {
      const reply = await handleCommand(text, deps);
      handled += 1;
      console.log(`> ${text}\n< ${reply.replace(/\n/g, "\n  ")}`);
      return reply;
    },
  },
  { isRunning: () => Date.now() < stopAt, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) },
);
console.log(`Done. Answered ${handled} message(s). Tasks: ${JSON.stringify(tasks.map((t) => [t.title, t.status]))}`);
