import {
  saveTask,
  saveTaskWithPlan,
  getTasks,
  updateTaskStatus,
  updateTaskStatusAndRecordOutcome,
  updateTaskPlan,
  updateTaskReminderId,
  recordTaskOutcome,
  deleteTask,
} from "../../storage/database";
import { cancelLocalReminder } from "../../native/reminders";
import { useTaskStore } from "../task-store";
import { doneToday } from "../../planner/schedule";

jest.mock("../../storage/database", () => ({
  saveTask: jest.fn(),
  saveTaskWithPlan: jest.fn(),
  getTasks: jest.fn(),
  updateTaskStatus: jest.fn(),
  updateTaskStatusAndRecordOutcome: jest.fn(),
  updateTaskPlan: jest.fn(),
  updateTaskReminderId: jest.fn(),
  recordTaskOutcome: jest.fn(),
  deleteTask: jest.fn(),
  updateTaskDetails: jest.fn(),
  rollTaskForward: jest.fn(),
}));
jest.mock("../../native/reminders", () => ({ cancelLocalReminder: jest.fn(), scheduleLocalReminder: jest.fn() }));
jest.mock("uuid", () => ({ v4: () => "generated-task-id" }));

const baseTask = {
  id: "existing",
  title: "Review notes",
  firstAction: null,
  steps: [],
  reminderId: null,
  status: "pending" as const,
  priority: 0,
  dueAt: null,
  completedAt: null,
  createdAt: 10,
  updatedAt: 10,
};

beforeEach(() => {
  jest.clearAllMocks();
  useTaskStore.setState({ tasks: [baseTask], loading: false, error: null });
});

describe("task store transaction ordering", () => {
  it("does not add a task to UI state when task-plus-plan persistence fails", async () => {
    (saveTaskWithPlan as jest.Mock).mockRejectedValueOnce(new Error("transaction rolled back"));

    await expect(useTaskStore.getState().createTaskWithPlan(
      "Draft email", "Open a new message", ["Write the subject"],
    )).rejects.toThrow("Failed to save task");

    expect(useTaskStore.getState().tasks).toEqual([baseTask]);
    expect(useTaskStore.getState().error).toBe("Failed to save task");
  });

  it("does not change the visible task status when status-plus-outcome persistence fails", async () => {
    (updateTaskStatusAndRecordOutcome as jest.Mock).mockRejectedValueOnce(new Error("transaction rolled back"));

    await expect(useTaskStore.getState().setStatusWithOutcome("existing", "active", "started"))
      .rejects.toThrow("Failed to update task status and activity");

    expect(useTaskStore.getState().tasks).toEqual([baseTask]);
    expect(useTaskStore.getState().error).toBe("Failed to update task status and activity");
  });

  it("updates visible status only after the combined persistence operation succeeds", async () => {
    let finishTransaction!: () => void;
    (updateTaskStatusAndRecordOutcome as jest.Mock).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finishTransaction = resolve; }),
    );

    const updating = useTaskStore.getState().setStatusWithOutcome("existing", "active", "started");
    expect(useTaskStore.getState().tasks[0].status).toBe("pending");

    finishTransaction();
    await updating;
    expect(useTaskStore.getState().tasks[0].status).toBe("active");
  });

  it("clears the saved task reminder only after the OS notification is cancelled", async () => {
    const task = { ...baseTask, reminderId: "notification-1" };
    useTaskStore.setState({ tasks: [task], loading: false, error: null });
    (cancelLocalReminder as jest.Mock).mockResolvedValueOnce(true);

    await useTaskStore.getState().cancelReminder(task.id);

    expect(cancelLocalReminder).toHaveBeenCalledWith("notification-1");
    expect(updateTaskReminderId).toHaveBeenCalledWith(task.id, null);
    expect(useTaskStore.getState().tasks[0].reminderId).toBeNull();
  });

  it("keeps the task's reminder ID when OS cancellation fails", async () => {
    const task = { ...baseTask, reminderId: "notification-1" };
    useTaskStore.setState({ tasks: [task], loading: false, error: null });
    (cancelLocalReminder as jest.Mock).mockResolvedValueOnce(false);

    await expect(useTaskStore.getState().cancelReminder(task.id)).rejects.toThrow(/cancel task reminder/i);

    expect(updateTaskReminderId).not.toHaveBeenCalled();
    expect(useTaskStore.getState().tasks[0].reminderId).toBe("notification-1");
  });
});


describe("planner fields", () => {
  const db = jest.requireMock("../../storage/database");
  const reminders = jest.requireMock("../../native/reminders");

  beforeEach(() => {
    jest.clearAllMocks();
    reminders.cancelLocalReminder.mockResolvedValue(true);
    reminders.scheduleLocalReminder.mockResolvedValue({ success: true, identifier: "rem-new", message: "ok" });
    for (const fn of ["saveTask", "updateTaskStatus", "updateTaskReminderId", "updateTaskDetails", "rollTaskForward"]) db[fn].mockResolvedValue(undefined);
  });

  test("a new task with a time gets a reminder at that time", async () => {
    useTaskStore.setState({ tasks: [] });
    const at = Date.now() + 60 * 60_000;
    const task = await useTaskStore.getState().addTask("Call the dentist", { dueAt: at, remind: true });
    expect(reminders.scheduleLocalReminder).toHaveBeenCalledWith("Call the dentist", new Date(at).toISOString(), null, { kind: "task", taskId: task.id });
    expect(db.saveTask.mock.calls[0][0]).toMatchObject({ dueAt: at, reminderId: "rem-new", repeat: "never" });
  });

  test("finishing a daily task moves it to tomorrow with a new reminder instead of closing it", async () => {
    const due = Date.now() - 60_000;
    useTaskStore.setState({ tasks: [{ ...baseTask, dueAt: due, repeat: "daily", reminderId: "rem-old" }] });
    await useTaskStore.getState().setStatus("existing", "done");
    const next = db.rollTaskForward.mock.calls[0][1];
    expect(next).toBeGreaterThan(Date.now());
    expect(new Date(next).getHours()).toBe(new Date(due).getHours());
    expect(reminders.cancelLocalReminder).toHaveBeenCalledWith("rem-old");
    const rolled = useTaskStore.getState().tasks[0];
    expect(rolled).toMatchObject({ status: "pending", dueAt: next, reminderId: "rem-new" });
    // Still counts as done today.
    expect(doneToday([rolled], new Date())).toBe(1);
  });

  test("editing the time replaces the old reminder", async () => {
    useTaskStore.setState({ tasks: [{ ...baseTask, reminderId: "rem-old" }] });
    const at = Date.now() + 2 * 60 * 60_000;
    await useTaskStore.getState().updateDetails("existing", { title: "Review notes", dueAt: at, repeat: "weekly", remind: true });
    expect(reminders.cancelLocalReminder).toHaveBeenCalledWith("rem-old");
    expect(db.updateTaskDetails).toHaveBeenCalledWith("existing", expect.objectContaining({ dueAt: at, repeat: "weekly" }));
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ dueAt: at, repeat: "weekly", reminderId: "rem-new" });
  });
});
