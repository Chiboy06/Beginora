import * as SQLite from "expo-sqlite";
import {
  saveTask,
  saveTaskWithPlan,
  updateTaskStatusAndRecordOutcome,
  type Task,
} from "../database";

jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));

type FakeTaskRow = {
  id: string;
  title: string;
  first_action: string | null;
  steps: string;
  reminder_id: string | null;
  status: Task["status"];
  priority: number;
  due_at: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

type FakeOutcomeRow = { task_id: string; outcome: string; created_at: number };

function makeTransactionalDb() {
  let userVersion = 0;
  let failOn: string | null = null;
  let tasks: FakeTaskRow[] = [];
  let outcomes: FakeOutcomeRow[] = [];

  const db = {
    async execAsync(sql: string): Promise<void> {
      const match = sql.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
      if (match) userVersion = Number(match[1]);
    },
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      if (/PRAGMA\s+user_version/i.test(sql)) {
        return { user_version: userVersion } as T;
      }
      return null;
    },
    async runAsync(sql: string, ...values: unknown[]): Promise<unknown> {
      if (failOn && sql.trim().startsWith(failOn)) throw new Error(`Injected failure: ${failOn}`);
      const params = values.length === 1 && Array.isArray(values[0])
        ? values[0] as unknown[]
        : values;
      if (/INSERT OR REPLACE INTO tasks/i.test(sql)) {
        const [id, title, firstAction, steps, reminderId, status, priority, dueAt, completedAt, createdAt, updatedAt] = params;
        const row: FakeTaskRow = {
          id: String(id), title: String(title), first_action: firstAction as string | null,
          steps: String(steps), reminder_id: reminderId as string | null,
          status: status as Task["status"], priority: Number(priority), due_at: dueAt as number | null,
          completed_at: completedAt as number | null, created_at: Number(createdAt), updated_at: Number(updatedAt),
        };
        const existing = tasks.findIndex((task) => task.id === row.id);
        if (existing >= 0) tasks[existing] = row;
        else tasks.push(row);
        return {};
      }
      if (/UPDATE tasks SET first_action = \?, steps = \?, updated_at = \? WHERE id = \?/i.test(sql)) {
        const [firstAction, steps, updatedAt, id] = params;
        const row = tasks.find((task) => task.id === id);
        if (row) {
          row.first_action = firstAction as string;
          row.steps = String(steps);
          row.updated_at = Number(updatedAt);
        }
        return {};
      }
      if (/UPDATE tasks SET status = \?, completed_at = \?, updated_at = \? WHERE id = \?/i.test(sql)) {
        const [status, completedAt, updatedAt, id] = params;
        const row = tasks.find((task) => task.id === id);
        if (row) {
          row.status = status as Task["status"];
          row.completed_at = completedAt as number | null;
          row.updated_at = Number(updatedAt);
        }
        return {};
      }
      if (/INSERT INTO task_outcomes/i.test(sql)) {
        const [taskId, outcome, createdAt] = params;
        if (!tasks.some((task) => task.id === taskId)) throw new Error("Foreign key failure");
        outcomes.push({ task_id: String(taskId), outcome: String(outcome), created_at: Number(createdAt) });
        return {};
      }
      throw new Error(`Unexpected SQL in transaction test: ${sql}`);
    },
    async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
      const oldTasks = structuredClone(tasks);
      const oldOutcomes = structuredClone(outcomes);
      try {
        await callback();
      } catch (error) {
        tasks = oldTasks;
        outcomes = oldOutcomes;
        throw error;
      }
    },
  };

  return {
    db: db as unknown as SQLite.SQLiteDatabase,
    get tasks() { return tasks; },
    get outcomes() { return outcomes; },
    failNextOn(sqlPrefix: string) { failOn = sqlPrefix; },
    clearFailure() { failOn = null; },
    resetRows() { tasks = []; outcomes = []; },
  };
}

const fake = makeTransactionalDb();
const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;
const plannedTask: Task = {
  id: "task-a",
  title: "Write the outline",
  firstAction: "Open a blank document",
  steps: ["Name the document", "Write three bullets"],
  reminderId: null,
  status: "pending",
  priority: 0,
  dueAt: null,
  completedAt: null,
  createdAt: 100,
  updatedAt: 100,
};

beforeEach(() => {
  fake.resetRows();
  fake.clearFailure();
  openDatabaseAsync.mockResolvedValue(fake.db);
});

describe("task persistence transactions", () => {
  it("rolls back a task insert if plan persistence fails, then allows a single clean retry", async () => {
    fake.failNextOn("UPDATE tasks SET first_action");

    await expect(saveTaskWithPlan(plannedTask, plannedTask.firstAction!, plannedTask.steps))
      .rejects.toThrow("Injected failure");
    expect(fake.tasks).toHaveLength(0);

    fake.clearFailure();
    await saveTaskWithPlan(plannedTask, plannedTask.firstAction!, plannedTask.steps);
    expect(fake.tasks).toHaveLength(1);
    expect(fake.tasks[0]).toMatchObject({
      id: plannedTask.id,
      first_action: plannedTask.firstAction,
      steps: JSON.stringify(plannedTask.steps),
    });
  });

  it("rolls back status when the paired outcome insert fails", async () => {
    await saveTask({ ...plannedTask, firstAction: null, steps: [] });
    fake.failNextOn("INSERT INTO task_outcomes");

    await expect(updateTaskStatusAndRecordOutcome("task-a", "active", "started"))
      .rejects.toThrow("Injected failure");

    expect(fake.tasks[0]).toMatchObject({ status: "pending", completed_at: null });
    expect(fake.outcomes).toHaveLength(0);
  });

  it("commits status and outcome together on success", async () => {
    await saveTask({ ...plannedTask, firstAction: null, steps: [] });

    await updateTaskStatusAndRecordOutcome("task-a", "done", "completed", 200);

    expect(fake.tasks[0]).toMatchObject({ status: "done", completed_at: 200, updated_at: 200 });
    expect(fake.outcomes).toEqual([{ task_id: "task-a", outcome: "completed", created_at: 200 }]);
  });
});
