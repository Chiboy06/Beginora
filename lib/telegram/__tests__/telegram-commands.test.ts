import { handleCommand, HELP_TEXT, type CommandDeps } from "../telegram-commands";
import type { Task } from "../../storage/database";
import type { DecompositionResult } from "../../ai/decomposer";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "write essay",
  firstAction: "Open the document",
  steps: [],
  reminderId: null,
  status: "pending",
  priority: 0,
  dueAt: null,
  completedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

function makeDeps(open: Task[] = []): jest.Mocked<CommandDeps> {
  return {
    plan: jest.fn(async (_task: string, _context?: string): Promise<DecompositionResult> => ({
      firstAction: "Write one sentence",
      steps: ["Add a second", "Read it aloud"],
      source: "rule_engine",
    })),
    openTasks: jest.fn(async (): Promise<Task[]> => open),
    addTask: jest.fn(async (title: string, _firstAction: string, _steps: string[]) => task({ title })),
    replan: jest.fn(async (_taskId: string, _firstAction: string, _steps: string[]) => {}),
    complete: jest.fn(async (_taskId: string) => {}),
  };
}

test("/start and unknown commands show help", async () => {
  const d = makeDeps();
  expect(await handleCommand("/start", d)).toBe(HELP_TEXT);
  expect(await handleCommand("/bogus", d)).toBe(HELP_TEXT);
});

test("/add plans and saves the task", async () => {
  const d = makeDeps();
  const reply = await handleCommand("/add write my essay intro", d);
  expect(d.addTask).toHaveBeenCalledWith("write my essay intro", "Write one sentence", ["Add a second", "Read it aloud"]);
  expect(reply).toContain("First step: Write one sentence");
});

test("/add without a task asks for one and saves nothing", async () => {
  const d = makeDeps();
  expect(await handleCommand("/add", d)).toMatch(/Tell me the task/);
  expect(d.addTask).not.toHaveBeenCalled();
});

test("commands addressed to the bot by name work", async () => {
  const d = makeDeps([task()]);
  expect(await handleCommand("/next@BeginoraBot", d)).toContain("Current task: write essay");
});

test("/stuck replans the current task with the old step as context", async () => {
  const d = makeDeps([task()]);
  await handleCommand("/stuck", d);
  expect(d.plan).toHaveBeenCalledWith("write essay", expect.stringContaining("Open the document"));
  expect(d.replan).toHaveBeenCalledWith("t1", "Write one sentence", ["Add a second", "Read it aloud"]);
});

test("/done completes the most recent open task", async () => {
  const d = makeDeps([task(), task({ id: "t2", title: "older" })]);
  expect(await handleCommand("/done", d)).toContain("write essay");
  expect(d.complete).toHaveBeenCalledWith("t1");
});

test("commands with no open tasks never touch storage", async () => {
  const d = makeDeps([]);
  for (const cmd of ["/next", "/stuck", "/done"]) await handleCommand(cmd, d);
  expect(d.replan).not.toHaveBeenCalled();
  expect(d.complete).not.toHaveBeenCalled();
});

test("free text gets a first step without saving", async () => {
  const d = makeDeps();
  const reply = await handleCommand("I need to clean my room", d);
  expect(reply).toContain("First step:");
  expect(reply).toContain("/add I need to clean my room");
  expect(d.addTask).not.toHaveBeenCalled();
});

test("safety responses are passed through and never saved", async () => {
  const d = makeDeps();
  d.plan.mockResolvedValue({ firstAction: "Please reach out to someone you trust.", steps: [], source: "safety_block" });
  expect(await handleCommand("/add how much medication should I take", d)).toBe("Please reach out to someone you trust.");
  expect(d.addTask).not.toHaveBeenCalled();
});

test("task text is capped at 200 characters", async () => {
  const d = makeDeps();
  await handleCommand(`/add ${"x".repeat(500)}`, d);
  expect((d.addTask.mock.calls[0][0] as string).length).toBe(200);
});
