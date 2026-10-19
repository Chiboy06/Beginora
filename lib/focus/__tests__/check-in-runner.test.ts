jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => "id"),
}));
jest.mock("../../storage/database", () => ({ getTasks: jest.fn(), getTaskOutcomes: jest.fn(async () => []) }));
jest.mock("../../native/reminders", () => ({ ensureConfigured: jest.fn(async () => {}) }));
jest.mock("../../native/usage-access", () => ({ hasUsageAccess: jest.fn(async () => false), getAppEvents: jest.fn(async () => []) }));

import * as Notifications from "expo-notifications";
import { getTasks } from "../../storage/database";
import { hasUsageAccess, getAppEvents } from "../../native/usage-access";
import { prefs } from "../../store/prefs";
import { runCheckInScan } from "../check-in-runner";
import type { Task } from "../../storage/database";

const HOUR = 60 * 60 * 1000;
const NOW = new Date(2026, 9, 20, 15, 0).getTime();
const stale: Task = {
  id: "t1", title: "Essay", firstAction: "Open the document", steps: [], reminderId: null, status: "pending",
  priority: 0, dueAt: null, completedAt: null, createdAt: NOW - 30 * HOUR, updatedAt: NOW - 30 * HOUR,
};

beforeEach(() => {
  jest.clearAllMocks();
  prefs.checkInsEnabled = true;
  prefs.usageSignalsEnabled = false;
  prefs.checkInLog = {};
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (getTasks as jest.Mock).mockResolvedValue([stale]);
});

test("does nothing when check-ins are off", async () => {
  prefs.checkInsEnabled = false;
  expect(await runCheckInScan(NOW)).toBeNull();
  expect(getTasks).not.toHaveBeenCalled();
});

test("stays silent without notification permission and never asks for it", async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  expect(await runCheckInScan(NOW)).toBeNull();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test("shows one check-in that opens the task, and logs it", async () => {
  const result = await runCheckInScan(NOW);
  expect(result).toMatchObject({ taskId: "t1", reason: "untouched" });
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: expect.objectContaining({ data: { kind: "task", taskId: "t1" } }),
    trigger: { channelId: "reminders" },
  });
  expect(prefs.checkInLog).toEqual({ t1: NOW });
});

test("the same task is not nudged twice in a day", async () => {
  await runCheckInScan(NOW);
  expect(await runCheckInScan(NOW + 2 * HOUR)).toBeNull();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test("usage events are read only when the user enabled signals and granted access", async () => {
  await runCheckInScan(NOW);
  expect(getAppEvents).not.toHaveBeenCalled();

  prefs.checkInLog = {};
  prefs.usageSignalsEnabled = true;
  (hasUsageAccess as jest.Mock).mockResolvedValue(true);
  (getAppEvents as jest.Mock).mockResolvedValue([
    { packageName: "com.zhiliaoapp.musically", type: "resumed", time: NOW - 40 * 60 * 1000 },
  ]);
  (getTasks as jest.Mock).mockResolvedValue([{ ...stale, createdAt: NOW - HOUR }]);
  expect(await runCheckInScan(NOW)).toMatchObject({ reason: "drift" });
});
