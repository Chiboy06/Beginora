// Local notifications are optional and fully on-device. Permission is requested
// only after a user explicitly asks for a reminder.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ToolCallResult } from "../orchestrator/types";
import { prefs, type ReminderLogEntry } from "../store/prefs";

// Quiet channel: gentle check-ins.
const CHANNEL_ID = "reminders";
// Reminders the user asked for: pop up with sound and vibration. A new id,
// because Android never lets an app raise an existing channel's importance.
export const ALERT_CHANNEL_ID = "reminder-alerts";
let configured = false;

export async function ensureConfigured(): Promise<void> {
  if (configured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Gentle check-ins",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 300, 200, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
  configured = true;
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export interface ScheduledReminderResult {
  success: boolean;
  message: string;
  identifier?: string;
}

export async function scheduleLocalReminder(
  text: string,
  datetime: string,
  replaceIdentifier?: string | null,
  data?: Record<string, string>,
): Promise<ScheduledReminderResult> {
  const when = new Date(datetime);
  if (Number.isNaN(when.getTime())) return { success: false, message: "Invalid reminder time." };
  if (when.getTime() <= Date.now() + 1000) {
    return { success: false, message: "That reminder time has already passed." };
  }

  try {
    await ensureConfigured();
    if (!(await ensurePermission())) {
      return { success: false, message: "Notifications are off. You can still use Beginora without reminders." };
    }
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Beginora reminder",
        // The lock screen can show a plain line instead of what the reminder is about.
        body: prefs.hideReminderText ? "You have a reminder." : text,
        sound: "default",
        ...(data ? { data } : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: ALERT_CHANNEL_ID,
        // setAlarmClock(): delivered on time, never deferred for battery.
        // Needs exact-alarm access; without it Android may deliver late.
        delivery: "alarmClock",
      },
    });
    if (replaceIdentifier) {
      await Notifications.cancelScheduledNotificationAsync(replaceIdentifier).catch(() => {});
      logReminderCancelled(replaceIdentifier);
    }
    logReminder({ id: identifier, text, at: when.getTime(), createdAt: Date.now(), cancelled: false });
    const onTime = Platform.OS !== "android" || (await Notifications.getExactAlarmPermissionsAsync()).granted;
    return {
      success: true,
      message: onTime
        ? "Reminder set."
        : "Reminder set, but it may arrive late: allow on-time reminders in Settings > Permissions and connections.",
      identifier,
    };
  } catch {
    return { success: false, message: "I couldn’t set a reminder. You can still return to this task whenever you’re ready." };
  }
}

// The last 50 reminders, so the app can list upcoming and past ones.
function logReminder(entry: ReminderLogEntry): void {
  prefs.reminderLog = [entry, ...prefs.reminderLog.filter((r) => r.id !== entry.id)].slice(0, 50);
}

function logReminderCancelled(id: string): void {
  prefs.reminderLog = prefs.reminderLog.map((r) => (r.id === id ? { ...r, cancelled: true } : r));
}

export function listReminders(now = Date.now()): { upcoming: ReminderLogEntry[]; past: ReminderLogEntry[] } {
  const active = prefs.reminderLog.filter((r) => !r.cancelled);
  return {
    upcoming: active.filter((r) => r.at > now).sort((a, b) => a.at - b.at),
    past: active.filter((r) => r.at <= now).sort((a, b) => b.at - a.at).slice(0, 10),
  };
}

// Opens Android's "Alarms & reminders" screen; resolves when the user returns.
export async function allowOnTimeReminders(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

export async function onTimeRemindersAllowed(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

export async function cancelLocalReminder(identifier: string): Promise<boolean> {
  if (!identifier.trim()) return true;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    logReminderCancelled(identifier);
    return true;
  } catch {
    return false;
  }
}

export async function scheduleReminder(
  text: string,
  datetime: string,
): Promise<ToolCallResult> {
  const result = await scheduleLocalReminder(text, datetime);
  return {
    success: result.success,
    message: result.message,
    ...(result.success ? {} : { error: result.message }),
  };
}
