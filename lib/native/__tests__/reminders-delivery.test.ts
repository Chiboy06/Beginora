jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native");
  actual.Platform.OS = "android";
  return actual;
});
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExactAlarmPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => "notif-1"),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: "date" },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

import * as Notifications from "expo-notifications";
import { prefs } from "../../store/prefs";
import { ALERT_CHANNEL_ID, cancelLocalReminder, listReminders, scheduleLocalReminder } from "../reminders";

const IN_AN_HOUR = new Date(Date.now() + 60 * 60_000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
  prefs.reminderLog = [];
});

test("reminders ring on time, with sound, on the high-importance alert channel", async () => {
  await scheduleLocalReminder("call Dr. Ben", IN_AN_HOUR);
  const request = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
  expect(request.content.sound).toBe("default");
  expect(request.trigger).toMatchObject({ channelId: ALERT_CHANNEL_ID, delivery: "alarmClock" });
  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(ALERT_CHANNEL_ID, expect.objectContaining({ importance: 4, sound: "default" }));
});

test("without on-time permission the reminder is still set and the reply says it may be late", async () => {
  (Notifications.getExactAlarmPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
  const result = await scheduleLocalReminder("call Dr. Ben", IN_AN_HOUR);
  expect(result.success).toBe(true);
  expect(result.message).toMatch(/may arrive late/);
});

test("set reminders are listed as upcoming, then past once their time has gone", async () => {
  await scheduleLocalReminder("call Dr. Ben", IN_AN_HOUR);
  const { upcoming, past } = listReminders();
  expect(upcoming).toEqual([expect.objectContaining({ id: "notif-1", text: "call Dr. Ben" })]);
  expect(past).toEqual([]);
  expect(listReminders(Date.now() + 2 * 60 * 60_000).past).toHaveLength(1);
});

test("a cancelled reminder disappears from the list", async () => {
  await scheduleLocalReminder("call Dr. Ben", IN_AN_HOUR);
  expect(await cancelLocalReminder("notif-1")).toBe(true);
  expect(listReminders()).toEqual({ upcoming: [], past: [] });
});

test("a past time is refused and not logged", async () => {
  const result = await scheduleLocalReminder("too late", new Date(Date.now() - 60_000).toISOString());
  expect(result).toEqual({ success: false, message: "That reminder time has already passed." });
  expect(prefs.reminderLog).toEqual([]);
});
