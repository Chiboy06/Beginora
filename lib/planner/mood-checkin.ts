// The daily "How was your day?" check-in: one notification a day at the time
// the user chose; tapping it opens a new journal entry.

import * as Notifications from "expo-notifications";
import { ensureConfigured } from "../native/reminders";
import { prefs } from "../store/prefs";

export async function setMoodCheckIn(enabled: boolean, hour: number, minute = 0): Promise<{ ok: boolean; message: string }> {
  const previous = prefs.moodCheckInId;
  if (previous) await Notifications.cancelScheduledNotificationAsync(previous).catch(() => {});
  prefs.moodCheckInId = undefined;
  prefs.moodCheckIn = { enabled: false, hour, minute };
  if (!enabled) return { ok: true, message: "Daily check-in turned off." };

  await ensureConfigured();
  if (!(await Notifications.requestPermissionsAsync()).granted) {
    return { ok: false, message: "Notifications are off for Beginora, so the check-in can't ring." };
  }
  prefs.moodCheckInId = await Notifications.scheduleNotificationAsync({
    content: { title: "How was your day?", body: "Tap to pick a mood and add a few words, if you like.", data: { kind: "mood_checkin" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: "reminders" },
  });
  prefs.moodCheckIn = { enabled: true, hour, minute };
  return { ok: true, message: `Every day at ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}.` };
}
