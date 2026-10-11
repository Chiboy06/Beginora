import * as Notifications from "expo-notifications";
import { getConfig, setConfig } from "../storage/database";
import { scheduleLocalReminder } from "./reminders";
import type { UpcomingCalendarEvent } from "./calendar";

export const APPOINTMENT_REMINDER_LEADS = [5, 10, 15, 30, 60] as const;
export type AppointmentReminderLead = (typeof APPOINTMENT_REMINDER_LEADS)[number];

export interface AppointmentReminderRecord {
  notificationId: string;
  startAt: string;
  leadMinutes: AppointmentReminderLead;
}

export function getAppointmentReminderTime(
  startAt: string,
  leadMinutes: number,
  now = Date.now(),
): number | null {
  if (!APPOINTMENT_REMINDER_LEADS.includes(leadMinutes as AppointmentReminderLead)) return null;
  const start = new Date(startAt).getTime();
  if (!Number.isFinite(start)) return null;
  const remindAt = start - leadMinutes * 60_000;
  return remindAt > now + 5_000 ? remindAt : null;
}

function reminderKey(event: UpcomingCalendarEvent): string {
  return `appointment_reminder:${event.id}:${new Date(event.start).getTime()}`;
}

function parseRecord(value: string | null): AppointmentReminderRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AppointmentReminderRecord>;
    if (
      typeof parsed.notificationId === "string" &&
      typeof parsed.startAt === "string" &&
      APPOINTMENT_REMINDER_LEADS.includes(parsed.leadMinutes as AppointmentReminderLead)
    ) {
      return parsed as AppointmentReminderRecord;
    }
  } catch {
    // A malformed local preference is ignored and replaced on the next request.
  }
  return null;
}

export async function getAppointmentReminder(
  event: UpcomingCalendarEvent,
): Promise<AppointmentReminderRecord | null> {
  try {
    return parseRecord(await getConfig(reminderKey(event)));
  } catch {
    return null;
  }
}

export async function scheduleAppointmentReminder(
  event: UpcomingCalendarEvent,
  leadMinutes: AppointmentReminderLead = 15,
): Promise<{ success: boolean; message: string; reminder?: AppointmentReminderRecord }> {
  if (event.allDay) {
    return { success: false, message: "Choose a timed appointment to set an advance reminder." };
  }
  const fireAt = getAppointmentReminderTime(event.start, leadMinutes);
  if (fireAt === null) {
    return { success: false, message: "That reminder time has passed or is too close to be useful." };
  }

  const key = reminderKey(event);
  try {
    const existing = parseRecord(await getConfig(key));
    if (existing && existing.startAt === event.start && existing.leadMinutes === leadMinutes) {
      return { success: true, message: `A reminder is already set ${leadMinutes} minutes before this appointment.`, reminder: existing };
    }

    const result = await scheduleLocalReminder(
      `Upcoming appointment: ${event.title}`,
      new Date(fireAt).toISOString(),
    );
    if (!result.success || !result.identifier) return { success: false, message: result.message };

    const reminder: AppointmentReminderRecord = {
      notificationId: result.identifier,
      startAt: event.start,
      leadMinutes,
    };
    try {
      await setConfig(key, JSON.stringify(reminder));
    } catch {
      await Notifications.cancelScheduledNotificationAsync(result.identifier).catch(() => {});
      return { success: false, message: "I couldn’t save this reminder on the device, so I cancelled it." };
    }
    if (existing && existing.notificationId !== reminder.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => {});
    }
    return { success: true, message: `One local reminder is set ${leadMinutes} minutes before this appointment.`, reminder };
  } catch {
    return { success: false, message: "I couldn’t set that appointment reminder. You can still use the event in your calendar." };
  }
}
