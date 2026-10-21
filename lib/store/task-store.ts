import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Repeat, Task, TaskOutcome } from "../storage/database";
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
  updateTaskDetails,
  rollTaskForward,
} from "../storage/database";
import { cancelLocalReminder, scheduleLocalReminder } from "../native/reminders";
import { nextOccurrence } from "../planner/schedule";

export interface TaskDetails {
  title: string;
  notes?: string | null;
  dueAt?: number | null;
  repeat?: Repeat;
  steps?: string[];
  project?: string | null;
  // Ring at dueAt. Ignored when dueAt is empty or already past.
  remind?: boolean;
}

// One reminder at the task's time; null when there is nothing to schedule.
async function scheduleTaskReminder(task: { id: string; title: string }, dueAt: number | null | undefined): Promise<string | null> {
  if (!dueAt || dueAt <= Date.now() + 1000) return null;
  const result = await scheduleLocalReminder(task.title, new Date(dueAt).toISOString(), null, { kind: "task", taskId: task.id });
  return result.success && result.identifier ? result.identifier : null;
}

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  loadTasks: () => Promise<void>;
  addTask: (title: string, details?: Omit<TaskDetails, "title">) => Promise<Task>;
  updateDetails: (id: string, details: TaskDetails) => Promise<void>;
  createTaskWithPlan: (title: string, firstAction: string, steps: string[]) => Promise<Task>;
  setPlan: (id: string, firstAction: string, steps: string[]) => Promise<void>;
  setFirstAction: (id: string, firstAction: string) => Promise<void>;
  setStatus: (id: string, status: Task["status"]) => Promise<void>;
  setStatusWithOutcome: (id: string, status: Task["status"], outcome: TaskOutcome) => Promise<void>;
  setReminderId: (id: string, reminderId: string | null) => Promise<void>;
  cancelReminder: (id: string) => Promise<void>;
  recordOutcome: (id: string, outcome: TaskOutcome) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => {
  // A repeating task that is done moves to its next time, with a new reminder.
  const rollRepeating = async (task: Task): Promise<boolean> => {
    const next = task.dueAt !== null ? nextOccurrence(task.dueAt, task.repeat ?? "never", Date.now()) : null;
    if (next === null) return false;
    const finishedAt = Date.now();
    try {
      await rollTaskForward(task.id, next, finishedAt);
    } catch {
      set({ error: "Done, but the next repeat could not be scheduled." });
      return false;
    }
    if (task.reminderId) await cancelLocalReminder(task.reminderId).catch(() => false);
    const reminderId = task.reminderId ? await scheduleTaskReminder(task, next).catch(() => null) : null;
    await updateTaskReminderId(task.id, reminderId).catch(() => {});
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, status: "pending", completedAt: finishedAt, dueAt: next, reminderId } : t)),
    }));
    return true;
  };

  return {
  tasks: [],
  loading: false,
  error: null,

  loadTasks: async () => {
    set({ loading: true, error: null });
    try {
      const tasks = await getTasks();
      set({ tasks, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  addTask: async (title, details = {}) => {
    const now = Date.now();
    const task: Task = {
      id: uuid(),
      title,
      firstAction: null,
      steps: details.steps ?? [],
      reminderId: null,
      status: "pending",
      priority: 0,
      dueAt: details.dueAt ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      notes: details.notes ?? null,
      repeat: details.repeat ?? "never",
      project: details.project ?? null,
    };
    if (details.remind) task.reminderId = await scheduleTaskReminder(task, task.dueAt).catch(() => null);
    try {
      await saveTask(task);
      set((s) => ({ tasks: [task, ...s.tasks], error: null }));
      return task;
    } catch {
      set({ error: "Failed to save task" });
      throw new Error("Failed to save task");
    }
  },

  updateDetails: async (id, details) => {
    const previous = get().tasks.find((task) => task.id === id);
    if (!previous) return;
    const next: Task = {
      ...previous,
      title: details.title,
      notes: details.notes ?? null,
      dueAt: details.dueAt ?? null,
      repeat: details.repeat ?? "never",
      steps: details.steps ?? previous.steps,
      // Not passed means unchanged, so older callers keep the project.
      project: details.project !== undefined ? details.project : previous.project ?? null,
      updatedAt: Date.now(),
    };
    try {
      await updateTaskDetails(id, { title: next.title, notes: next.notes ?? null, dueAt: next.dueAt, repeat: next.repeat ?? "never", steps: next.steps, project: next.project ?? null });
    } catch {
      set({ error: "Failed to save task" });
      throw new Error("Failed to save task");
    }
    // The old reminder rang at the old time: replace it.
    if (previous.reminderId) await cancelLocalReminder(previous.reminderId).catch(() => false);
    next.reminderId = details.remind ? await scheduleTaskReminder(next, next.dueAt).catch(() => null) : null;
    await updateTaskReminderId(id, next.reminderId).catch(() => {});
    set((s) => ({ tasks: s.tasks.map((task) => (task.id === id ? next : task)) }));
  },

  createTaskWithPlan: async (title, firstAction, steps) => {
    const now = Date.now();
    const task: Task = {
      id: uuid(),
      title,
      firstAction,
      steps,
      reminderId: null,
      status: "pending",
      priority: 0,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveTaskWithPlan(task, firstAction, steps);
      set((s) => ({ tasks: [task, ...s.tasks], error: null }));
      return task;
    } catch {
      set({ error: "Failed to save task" });
      throw new Error("Failed to save task");
    }
  },

  setPlan: async (id, firstAction, steps) => {
    const previous = get().tasks.find((task) => task.id === id);
    set((s) => ({
      tasks: s.tasks.map((task) =>
        task.id === id ? { ...task, firstAction, steps, updatedAt: Date.now() } : task,
      ),
    }));
    try {
      await updateTaskPlan(id, firstAction, steps);
    } catch {
      if (previous) {
        set((s) => ({ tasks: s.tasks.map((task) => task.id === id ? previous : task) }));
      }
      set({ error: "Failed to save task plan" });
      throw new Error("Failed to save task plan");
    }
  },

  // Kept as a narrow compatibility wrapper for the existing chat tool route.
  setFirstAction: async (id, firstAction) => {
    const steps = get().tasks.find((task) => task.id === id)?.steps ?? [];
    await get().setPlan(id, firstAction, steps);
  },

  setStatus: async (id, status) => {
    const previous = get().tasks.find((task) => task.id === id);
    const now = Date.now();
    try {
      await updateTaskStatus(id, status, now);
    } catch {
      set({ error: "Failed to update task status" });
      throw new Error("Failed to update task status");
    }
    set((s) => ({
      tasks: s.tasks.map((task) =>
        task.id === id
          ? { ...task, status, completedAt: status === "done" ? now : null, updatedAt: now }
          : task,
      ),
    }));
    if (status === "done" && previous && (await rollRepeating(previous))) return;
    if (status === "done" && previous?.reminderId) {
      try {
        if (await cancelLocalReminder(previous.reminderId)) {
          try {
            await updateTaskReminderId(id, null);
            set((s) => ({ tasks: s.tasks.map((task) => task.id === id ? { ...task, reminderId: null } : task) }));
          } catch {
            set({ error: "Task completed, but reminder state could not be cleared." });
          }
        } else {
          set({ error: "Task completed, but its reminder could not be cancelled." });
        }
      } catch {
        set({ error: "Task completed, but its reminder could not be cancelled." });
      }
    }
  },

  setStatusWithOutcome: async (id, status, outcome) => {
    const previous = get().tasks.find((task) => task.id === id);
    const now = Date.now();
    try {
      await updateTaskStatusAndRecordOutcome(id, status, outcome, now);
    } catch {
      set({ error: "Failed to update task status and activity" });
      throw new Error("Failed to update task status and activity");
    }
    set((s) => ({
      tasks: s.tasks.map((task) =>
        task.id === id
          ? { ...task, status, completedAt: status === "done" ? now : null, updatedAt: now }
          : task,
      ),
    }));
    if (status === "done" && previous && (await rollRepeating(previous))) return;
    if (status === "done" && previous?.reminderId) {
      try {
        if (await cancelLocalReminder(previous.reminderId)) {
          try {
            await updateTaskReminderId(id, null);
            set((s) => ({ tasks: s.tasks.map((task) => task.id === id ? { ...task, reminderId: null } : task) }));
          } catch {
            set({ error: "Task completed, but reminder state could not be cleared." });
          }
        } else {
          set({ error: "Task completed, but its reminder could not be cancelled." });
        }
      } catch {
        set({ error: "Task completed, but its reminder could not be cancelled." });
      }
    }
  },

  setReminderId: async (id, reminderId) => {
    const previous = get().tasks.find((task) => task.id === id);
    set((s) => ({
      tasks: s.tasks.map((task) => task.id === id ? { ...task, reminderId } : task),
    }));
    try {
      await updateTaskReminderId(id, reminderId);
    } catch {
      if (previous) {
        set((s) => ({ tasks: s.tasks.map((task) => task.id === id ? previous : task) }));
      }
      set({ error: "Failed to save reminder" });
      throw new Error("Failed to save reminder");
    }
  },

  cancelReminder: async (id) => {
    const reminderId = get().tasks.find((task) => task.id === id)?.reminderId;
    if (!reminderId) return;
    let notificationCancelled = false;
    try {
      notificationCancelled = await cancelLocalReminder(reminderId);
      if (!notificationCancelled) throw new Error("Notification cancellation failed");
      await updateTaskReminderId(id, null);
      set((s) => ({
        tasks: s.tasks.map((task) => task.id === id ? { ...task, reminderId: null } : task),
      }));
    } catch {
      set({ error: notificationCancelled
        ? "Reminder cancelled, but its saved state could not be cleared. You can retry from this task."
        : "Could not cancel this reminder; its saved state was kept." });
      throw new Error(notificationCancelled
        ? "Reminder cancelled, but saved state could not be cleared"
        : "Could not cancel task reminder");
    }
  },

  recordOutcome: async (id, outcome) => {
    try {
      await recordTaskOutcome(id, outcome);
    } catch {
      set({ error: "Failed to save task activity" });
      throw new Error("Failed to save task activity");
    }
  },

  removeTask: async (id) => {
    const previous = get().tasks;
    const existing = previous.find((task) => task.id === id);
    if (existing?.reminderId && !(await cancelLocalReminder(existing.reminderId))) {
      set({ error: "Could not cancel this task’s reminder, so the task was not removed." });
      throw new Error("Could not cancel task reminder");
    }
    set((s) => ({ tasks: s.tasks.filter((task) => task.id !== id) }));
    try {
      await deleteTask(id);
    } catch {
      set({ tasks: previous, error: "Failed to delete task" });
      throw new Error("Failed to delete task");
    }
  },

  clearError: () => set({ error: null }),
  };
});
