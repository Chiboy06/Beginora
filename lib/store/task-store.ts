import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Task, TaskOutcome } from "../storage/database";
import {
  saveTask,
  getTasks,
  updateTaskStatus,
  updateTaskPlan,
  updateTaskReminderId,
  recordTaskOutcome,
  deleteTask,
} from "../storage/database";
import { cancelLocalReminder } from "../native/reminders";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  loadTasks: () => Promise<void>;
  addTask: (title: string) => Promise<Task>;
  setPlan: (id: string, firstAction: string, steps: string[]) => Promise<void>;
  setFirstAction: (id: string, firstAction: string) => Promise<void>;
  setStatus: (id: string, status: Task["status"]) => Promise<void>;
  setReminderId: (id: string, reminderId: string | null) => Promise<void>;
  recordOutcome: (id: string, outcome: TaskOutcome) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
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

  addTask: async (title) => {
    const now = Date.now();
    const task: Task = {
      id: uuid(),
      title,
      firstAction: null,
      steps: [],
      reminderId: null,
      status: "pending",
      priority: 0,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ tasks: [task, ...s.tasks], error: null }));
    try {
      await saveTask(task);
      return task;
    } catch {
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== task.id),
        error: "Failed to save task",
      }));
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
    set((s) => ({
      tasks: s.tasks.map((task) =>
        task.id === id
          ? { ...task, status, completedAt: status === "done" ? now : null, updatedAt: now }
          : task,
      ),
    }));
    try {
      await updateTaskStatus(id, status);
      if (status === "done" && previous?.reminderId) {
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
      }
    } catch {
      if (previous) {
        set((s) => ({ tasks: s.tasks.map((task) => task.id === id ? previous : task) }));
      }
      set({ error: "Failed to update task status" });
      throw new Error("Failed to update task status");
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
}));
