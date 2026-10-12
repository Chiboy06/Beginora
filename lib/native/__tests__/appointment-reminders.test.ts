jest.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../storage/database", () => ({
  deleteConfig: jest.fn().mockResolvedValue(undefined),
  getConfig: jest.fn(),
  setConfig: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../reminders", () => ({ scheduleLocalReminder: jest.fn() }));

import * as Notifications from "expo-notifications";
import { deleteConfig, getConfig, setConfig } from "../../storage/database";
import { scheduleLocalReminder } from "../reminders";
import {
  cancelAppointmentReminder,
  getAppointmentReminder,
  getAppointmentReminderTime,
  getStoredAppointmentReminder,
  scheduleAppointmentReminder,
  type AppointmentReminderRecord,
} from "../appointment-reminders";
import type { UpcomingCalendarEvent } from "../calendar";

const mockedGetConfig = jest.mocked(getConfig);
const mockedDeleteConfig = jest.mocked(deleteConfig);
const mockedSetConfig = jest.mocked(setConfig);
const mockedScheduleReminder = jest.mocked(scheduleLocalReminder);
const mockedCancelNotification = jest.mocked(Notifications.cancelScheduledNotificationAsync);

function makeEvent(startOffsetHours = 2, allDay = false): UpcomingCalendarEvent {
  const start = new Date(Date.now() + startOffsetHours * 60 * 60 * 1000).toISOString();
  return { id: "device-event-1", title: "Appointment", start, end: new Date(new Date(start).getTime() + 3600000).toISOString(), allDay };
}

describe("appointment reminder timing and persistence", () => {
  const now = new Date("2026-10-12T10:00:00.000Z").getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetConfig.mockResolvedValue(null);
    mockedDeleteConfig.mockResolvedValue(undefined);
    mockedSetConfig.mockResolvedValue(undefined);
    mockedScheduleReminder.mockResolvedValue({ success: true, message: "One local reminder is scheduled.", identifier: "notification-1" });
  });

  it("calculates the selected lead time before an appointment", () => {
    expect(getAppointmentReminderTime("2026-10-12T11:00:00.000Z", 15, now))
      .toBe(new Date("2026-10-12T10:45:00.000Z").getTime());
  });

  it("accepts only the small supported set of useful reminder lead times", () => {
    expect(getAppointmentReminderTime("2026-10-12T12:00:00.000Z", 5, now)).not.toBeNull();
    expect(getAppointmentReminderTime("2026-10-12T12:00:00.000Z", 15, now)).not.toBeNull();
    expect(getAppointmentReminderTime("2026-10-12T12:00:00.000Z", 37, now)).toBeNull();
  });

  it("does not schedule reminders after the event or within the short safety window", () => {
    expect(getAppointmentReminderTime("2026-10-12T10:10:00.000Z", 15, now)).toBeNull();
    expect(getAppointmentReminderTime("2026-10-12T10:15:04.000Z", 15, now)).toBeNull();
  });

  it("rejects malformed appointment timestamps", () => {
    expect(getAppointmentReminderTime("not-a-date", 15, now)).toBeNull();
  });

  it("stores one notification identifier locally after scheduling", async () => {
    const event = makeEvent();
    const result = await scheduleAppointmentReminder(event, 15);
    expect(result.success).toBe(true);
    expect(mockedScheduleReminder).toHaveBeenCalledWith(
      "An appointment is coming up. Open Beginora to review your plan.",
      expect.any(String),
      undefined,
      { kind: "appointment", eventId: event.id },
    );
    expect(mockedSetConfig).toHaveBeenCalledWith(`appointment_reminder:${event.id}`, expect.stringContaining("notification-1"));
  });

  it("does not schedule a duplicate when the same appointment reminder is already stored", async () => {
    const event = makeEvent();
    const existing: AppointmentReminderRecord = { notificationId: "existing-id", startAt: event.start, leadMinutes: 15 };
    mockedGetConfig.mockResolvedValue(JSON.stringify(existing));
    const result = await scheduleAppointmentReminder(event, 15);
    expect(result.success).toBe(true);
    expect(mockedScheduleReminder).not.toHaveBeenCalled();
  });

  it("cancels the prior notification before persisting a replacement", async () => {
    const event = makeEvent();
    mockedGetConfig.mockResolvedValue(JSON.stringify({ notificationId: "old-id", startAt: event.start, leadMinutes: 15 }));
    mockedScheduleReminder.mockResolvedValue({ success: true, message: "One local reminder is scheduled.", identifier: "new-id" });
    const result = await scheduleAppointmentReminder(event, 60);
    expect(result.success).toBe(true);
    expect(mockedCancelNotification).toHaveBeenCalledWith("old-id");
    expect(mockedCancelNotification.mock.invocationCallOrder[0]).toBeLessThan(mockedSetConfig.mock.invocationCallOrder[0]);
  });

  it("cancels the OS notification before removing saved reminder state", async () => {
    const event = makeEvent();
    mockedGetConfig.mockResolvedValue(JSON.stringify({ notificationId: "old-id", startAt: event.start, leadMinutes: 15 }));

    const result = await cancelAppointmentReminder(event);

    expect(result.success).toBe(true);
    expect(result.reminder).toBeNull();
    expect(mockedCancelNotification).toHaveBeenCalledWith("old-id");
    expect(mockedDeleteConfig).toHaveBeenCalledWith(`appointment_reminder:${event.id}`);
    expect(mockedCancelNotification.mock.invocationCallOrder[0]).toBeLessThan(mockedDeleteConfig.mock.invocationCallOrder[0]);
  });

  it("preserves saved state and does not delete it when OS cancellation fails", async () => {
    const event = makeEvent();
    const existing: AppointmentReminderRecord = { notificationId: "old-id", startAt: event.start, leadMinutes: 15 };
    mockedGetConfig.mockResolvedValue(JSON.stringify(existing));
    mockedCancelNotification.mockRejectedValueOnce(new Error("native cancel failed"));

    const result = await cancelAppointmentReminder(event);

    expect(result.success).toBe(false);
    expect(result.reminder).toEqual(existing);
    expect(mockedDeleteConfig).not.toHaveBeenCalled();
  });

  it("reports a same-ID changed-start reminder as stale and cancels it before persisting its replacement", async () => {
    const oldEvent = makeEvent();
    const movedEvent: UpcomingCalendarEvent = {
      ...oldEvent,
      start: new Date(new Date(oldEvent.start).getTime() + 2 * 60 * 60 * 1000).toISOString(),
    };
    const existing: AppointmentReminderRecord = { notificationId: "old-id", startAt: oldEvent.start, leadMinutes: 15 };
    mockedGetConfig.mockResolvedValue(JSON.stringify(existing));
    mockedScheduleReminder.mockResolvedValue({ success: true, message: "One local reminder is scheduled.", identifier: "replacement-id" });

    expect(await getStoredAppointmentReminder(movedEvent)).toEqual(existing);
    expect(await getAppointmentReminder(movedEvent)).toBeNull();
    const result = await scheduleAppointmentReminder(movedEvent, 15);

    expect(result.success).toBe(true);
    expect(mockedCancelNotification).toHaveBeenCalledWith("old-id");
    expect(mockedCancelNotification.mock.invocationCallOrder[0]).toBeLessThan(mockedSetConfig.mock.invocationCallOrder[0]);
    expect(mockedSetConfig).toHaveBeenCalledWith(
      `appointment_reminder:${movedEvent.id}`,
      expect.stringContaining(movedEvent.start),
    );
  });

  it("keeps the old record if cancelling it during replacement fails", async () => {
    const event = makeEvent();
    const existing: AppointmentReminderRecord = { notificationId: "old-id", startAt: event.start, leadMinutes: 15 };
    mockedGetConfig.mockResolvedValue(JSON.stringify(existing));
    mockedCancelNotification.mockRejectedValueOnce(new Error("native cancel failed"));
    mockedScheduleReminder.mockResolvedValue({ success: true, message: "One local reminder is scheduled.", identifier: "replacement-id" });

    const result = await scheduleAppointmentReminder(event, 60);

    expect(result.success).toBe(false);
    expect(result.reminder).toEqual(existing);
    expect(mockedSetConfig).not.toHaveBeenCalled();
    expect(mockedCancelNotification).toHaveBeenNthCalledWith(1, "old-id");
    expect(mockedCancelNotification).toHaveBeenNthCalledWith(2, "replacement-id");
  });

  it("does not schedule a reminder for all-day events", async () => {
    const result = await scheduleAppointmentReminder(makeEvent(2, true), 15);
    expect(result.success).toBe(false);
    expect(mockedGetConfig).not.toHaveBeenCalled();
  });
});
