jest.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../storage/database", () => ({
  getConfig: jest.fn(),
  setConfig: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../reminders", () => ({ scheduleLocalReminder: jest.fn() }));

import * as Notifications from "expo-notifications";
import { getConfig, setConfig } from "../../storage/database";
import { scheduleLocalReminder } from "../reminders";
import {
  getAppointmentReminderTime,
  scheduleAppointmentReminder,
  type AppointmentReminderRecord,
} from "../appointment-reminders";
import type { UpcomingCalendarEvent } from "../calendar";

const mockedGetConfig = jest.mocked(getConfig);
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

  it("keeps the old notification until a replacement is persisted, then cancels it", async () => {
    const event = makeEvent();
    mockedGetConfig.mockResolvedValue(JSON.stringify({ notificationId: "old-id", startAt: event.start, leadMinutes: 15 }));
    mockedScheduleReminder.mockResolvedValue({ success: true, message: "One local reminder is scheduled.", identifier: "new-id" });
    const result = await scheduleAppointmentReminder(event, 60);
    expect(result.success).toBe(true);
    expect(mockedCancelNotification).toHaveBeenCalledWith("old-id");
  });

  it("does not schedule a reminder for all-day events", async () => {
    const result = await scheduleAppointmentReminder(makeEvent(2, true), 15);
    expect(result.success).toBe(false);
    expect(mockedGetConfig).not.toHaveBeenCalled();
  });
});
