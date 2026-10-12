import * as Notifications from "expo-notifications";
import { deleteConfig, getConfig, setConfig } from "../storage/database";
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
  return `appointment_reminder:${event.id}`;
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
  const record = await getStoredAppointmentReminder(event);
  return record?.startAt === event.start ? record : null;
}

// Unlike getAppointmentReminder, this includes a saved reminder for an older
// start time. The calendar UI needs that record to identify stale OS alerts and
// offer cancellation or replacement rather than silently showing no reminder.
export async function getStoredAppointmentReminder(
  event: UpcomingCalendarEvent,
): Promise<AppointmentReminderRecord | null> {
  try {
    return parseRecord(await getConfig(reminderKey(event)));
  } catch {
    return null;
  }
}

export interface AppointmentReminderActionResult {
  success: boolean;
  message: string;
  // Returned when the action can determine the reminder state, including when
  // a failed replacement leaves the prior notification and record untouched.
  reminder?: AppointmentReminderRecord | null;
  notificationCancelled?: boolean;
}

export async function cancelAppointmentReminder(
  event: UpcomingCalendarEvent,
): Promise<AppointmentReminderActionResult> {
  const key = reminderKey(event);
  let existing: AppointmentReminderRecord | null = null;
  let stateLoaded = false;
  try {
    existing = parseRecord(await getConfig(key));
    stateLoaded = true;
    if (!existing) {
      return { success: true, message: "There is no saved reminder for this appointment.", reminder: null };
    }

    // Cancel at the OS first. If that rejects, retain the local record so the
    // UI does not forget about a notification that may still be scheduled.
    await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
    try {
      await deleteConfig(key);
    } catch {
      return {
        success: false,
        message: "The notification was cancelled, but I couldn’t clear its saved reminder on this device.",
        reminder: null,
        notificationCancelled: true,
      };
    }
    return {
      success: true,
      message: "Appointment reminder cancelled.",
      reminder: null,
      notificationCancelled: true,
    };
  } catch {
    return {
      success: false,
      message: "I couldn’t cancel this appointment reminder. Its saved state was kept.",
      ...(stateLoaded ? { reminder: existing } : {}),
    };
  }
}

export async function scheduleAppointmentReminder(
  event: UpcomingCalendarEvent,
  leadMinutes: AppointmentReminderLead = 15,
): Promise<AppointmentReminderActionResult> {
  if (event.allDay) {
    return { success: false, message: "Choose a timed appointment to set an advance reminder." };
  }
  const fireAt = getAppointmentReminderTime(event.start, leadMinutes);
  if (fireAt === null) {
    return { success: false, message: "That reminder time has passed or is too close to be useful." };
  }

  const key = reminderKey(event);
  let existing: AppointmentReminderRecord | null = null;
  let stateLoaded = false;
  try {
    existing = parseRecord(await getConfig(key));
    stateLoaded = true;
    if (existing && existing.startAt === event.start && existing.leadMinutes === leadMinutes) {
      return { success: true, message: `A reminder is already set ${leadMinutes} minutes before this appointment.`, reminder: existing };
    }

    const result = await scheduleLocalReminder(
      "An appointment is coming up. Open Beginora to review your plan.",
      new Date(fireAt).toISOString(),
      undefined,
      { kind: "appointment", eventId: event.id },
    );
    if (!result.success || !result.identifier) {
      return { success: false, message: result.message, reminder: existing };
    }

    // Do not persist a replacement until the prior OS alert has been cancelled.
    // On cancellation failure, discard the new notification and keep the old
    // local record so a later attempt can retry without hiding the old alert.
    if (existing) {
      try {
        await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
      } catch {
        await Notifications.cancelScheduledNotificationAsync(result.identifier).catch(() => {});
        return {
          success: false,
          message: "I couldn’t replace the previous reminder, so its saved state was kept.",
          reminder: existing,
        };
      }
    }

    const reminder: AppointmentReminderRecord = {
      notificationId: result.identifier,
      startAt: event.start,
      leadMinutes,
    };
    try {
      await setConfig(key, JSON.stringify(reminder));
    } catch {
      await Notifications.cancelScheduledNotificationAsync(result.identifier).catch(() => {});
      return {
        success: false,
        message: existing
          ? "I cancelled the previous alert, but couldn’t save its replacement on this device."
          : "I couldn’t save this reminder on the device, so I cancelled it.",
        reminder: null,
        notificationCancelled: Boolean(existing),
      };
    }
    return { success: true, message: `One local reminder is set ${leadMinutes} minutes before this appointment.`, reminder };
  } catch {
    return {
      success: false,
      message: "I couldn’t set that appointment reminder. You can still use the event in your calendar.",
      ...(stateLoaded ? { reminder: existing } : {}),
    };
  }
}
