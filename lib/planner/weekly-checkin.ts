// The Monday check-in: a weekly notification that opens the weekly plan. It
// is scheduled on the phone, so it works offline and with no computer on.

import * as Notifications from "expo-notifications";
import { ensureConfigured } from "../native/reminders";
import { prefs } from "../store/prefs";

// expo-notifications counts weekdays from Sunday = 1, so Monday is 2.
const MONDAY = 2;

export async function setWeeklyCheckIn(enabled: boolean, hour: number): Promise<{ ok: boolean; message: string }> {
  const previous = prefs.weeklyCheckInId;
  if (previous) await Notifications.cancelScheduledNotificationAsync(previous).catch(() => {});
  prefs.weeklyCheckInId = undefined;
  prefs.weeklyCheckIn = { enabled: false, hour };
  if (!enabled) return { ok: true, message: "Monday check-in turned off." };

  await ensureConfigured();
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ok: false, message: "Notifications are off for Beginora, so the check-in can't ring." };
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Plan your week",
      body: "What's your plan for the week? Let's check it against your goals.",
      data: { kind: "weekly_plan" },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: MONDAY, hour, minute: 0, channelId: "reminders" },
  });
  prefs.weeklyCheckInId = id;
  prefs.weeklyCheckIn = { enabled: true, hour };
  return { ok: true, message: `Every Monday at ${String(hour).padStart(2, "0")}:00.` };
}
