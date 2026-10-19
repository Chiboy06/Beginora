jest.mock("../telegram-service", () => ({ getTelegramConfig: jest.fn() }));
jest.mock("../../ai/decomposer", () => ({ decompose: jest.fn() }));
jest.mock("../../storage/database", () => ({ getTasks: jest.fn(async () => []) }));
jest.mock("../../store/task-store", () => ({ useTaskStore: { getState: jest.fn() } }));
jest.mock("../telegram-bot", () => ({ runBotLoop: jest.fn() }));

import { getTelegramConfig } from "../telegram-service";
import { runBotLoop } from "../telegram-bot";
import { prefs } from "../../store/prefs";
import { isTelegramBotRunning, startTelegramBot, stopTelegramBot } from "../telegram-runner";

const configured = { botToken: "123:abc", chatId: "42", enabled: true };
const loops: { isRunning: () => boolean; finish: () => void }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  loops.length = 0;
  stopTelegramBot();
  prefs.telegramTwoWay = true;
  (getTelegramConfig as jest.Mock).mockResolvedValue(configured);
  (runBotLoop as jest.Mock).mockImplementation((_deps, control) => new Promise<void>((resolve) => {
    loops.push({ isRunning: control.isRunning, finish: resolve });
  }));
});

test("does not start unless replies are on and Telegram is fully configured", async () => {
  prefs.telegramTwoWay = false;
  expect(await startTelegramBot()).toBe(false);
  prefs.telegramTwoWay = true;
  (getTelegramConfig as jest.Mock).mockResolvedValue({ ...configured, chatId: "" });
  expect(await startTelegramBot()).toBe(false);
  expect(runBotLoop).not.toHaveBeenCalled();
});

test("starting twice runs only one poller", async () => {
  await startTelegramBot();
  await startTelegramBot();
  expect(runBotLoop).toHaveBeenCalledTimes(1);
  expect(isTelegramBotRunning()).toBe(true);
});

test("stop then start never leaves two pollers running", async () => {
  await startTelegramBot();
  stopTelegramBot();
  await startTelegramBot();
  expect(loops).toHaveLength(2);
  // The first loop may still be waiting on a long poll; it must see itself as stopped.
  expect(loops[0].isRunning()).toBe(false);
  expect(loops[1].isRunning()).toBe(true);

  // When the old loop finally returns, it must not mark the new one as stopped.
  loops[0].finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(isTelegramBotRunning()).toBe(true);
});

test("the bot uses the saved token and only the saved chat", async () => {
  await startTelegramBot();
  const deps = (runBotLoop as jest.Mock).mock.calls[0][0];
  expect(deps).toMatchObject({ token: "123:abc", chatId: "42" });
});
