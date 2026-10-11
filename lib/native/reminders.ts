// Local notifications are optional and fully on-device. Permission is requested
// only after a user explicitly asks for a reminder.

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { ToolCallResult } from "../orchestrator/types";

const CHANNEL_ID = "reminders";
let configured = false;

async function ensureConfigured(): Promise<void> {
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
      name: "Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
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
      content: { title: "Beginora reminder", body: text, sound: false, ...(data ? { data } : {}) },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: CHANNEL_ID,
      },
    });
    if (replaceIdentifier) {
      await Notifications.cancelScheduledNotificationAsync(replaceIdentifier).catch(() => {});
    }
    return { success: true, message: "One local reminder is scheduled.", identifier };
  } catch {
    return { success: false, message: "I couldn’t set a reminder. You can still return to this task whenever you’re ready." };
  }
}

export async function cancelLocalReminder(identifier: string): Promise<boolean> {
  if (!identifier.trim()) return true;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
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
