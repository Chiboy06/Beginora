import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { Task } from "../storage/database";
import {
  saveTask,
  getTasks,
  updateTaskStatus,
  updateTaskFirstAction,
  deleteTask,
} from "../storage/database";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;

  loadTasks: () => Promise<void>;
  addTask: (title: string, description?: string) => Promise<Task>;
  setFirstAction: (id: string, firstAction: string) => Promise<void>;
  setStatus: (id: string, status: Task["status"]) => Promise<void>;
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

  addTask: async (title, description) => {
    const now = Date.now();
    const task: Task = {
      id: uuid(),
      title,
      firstAction: null,
      status: "pending",
      priority: 0,
      dueAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    // Optimistic update
    set((s) => ({ tasks: [task, ...s.tasks] }));
    try {
      await saveTask(task);
    } catch (err) {
      // Rollback on failure
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== task.id), error: "Failed to save task" }));
    }
    return task;
  },

  setFirstAction: async (id, firstAction) => {
    // Optimistic update
    set((s) => ({
      tasks: s.tasks.map((t) => t.id === id ? { ...t, firstAction, updatedAt: Date.now() } : t),
    }));
    try {
      await updateTaskFirstAction(id, firstAction);
    } catch (err) {
      set({ error: "Failed to save first action" });
    }
  },

  setStatus: async (id, status) => {
    const completedAt = status === "done" ? Date.now() : null;
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status, completedAt, updatedAt: Date.now() } : t,
      ),
    }));
    try {
      await updateTaskStatus(id, status);
    } catch (err) {
      set({ error: "Failed to update task status" });
    }
  },

  removeTask: async (id) => {
    const prev = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    try {
      await deleteTask(id);
    } catch (err) {
      set({ tasks: prev, error: "Failed to delete task" });
    }
  },

  clearError: () => set({ error: null }),
}));
