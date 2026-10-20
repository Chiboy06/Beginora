// Gathers tasks, outcomes and (if allowed) screen-pattern signals, then shows
// at most one gentle check-in. Runs from the background task and whenever the
// app returns to the foreground.

import * as Notifications from "expo-notifications";
import { getTaskOutcomes, getTasks } from "../storage/database";
import { prefs } from "../store/prefs";
import { ensureConfigured } from "../native/reminders";
import { getAppEvents, hasUsageAccess } from "../native/usage-access";
import { pickCheckIn, pruneNudgeLog, type CheckIn } from "./check-ins";
import { DISTRACTION_WINDOW_MS, isDrift, summarizeUsage } from "./usage-signals";

const OWN_PACKAGE = "app.beginora.android";

async function detectDrift(now: number): Promise<boolean> {
  if (!prefs.usageSignalsEnabled || !(await hasUsageAccess())) return false;
  try {
    const events = await getAppEvents(now - DISTRACTION_WINDOW_MS);
    return isDrift(summarizeUsage(events, now, OWN_PACKAGE));
  } catch {
    return false;
  }
}

export async function runCheckInScan(now = Date.now()): Promise<CheckIn | null> {
  if (!prefs.checkInsEnabled) return null;
  // Never prompt from the background: without permission, stay silent.
  if (!(await Notifications.getPermissionsAsync()).granted) return null;

  const tasks = (await getTasks()).filter((task) => task.status !== "done");
  if (tasks.length === 0) return null;
  const outcomes = Object.fromEntries(
    await Promise.all(tasks.map(async (task) => [task.id, await getTaskOutcomes(task.id, 20)] as const)),
  );
  const log = pruneNudgeLog(prefs.checkInLog, now);

  // The user's quiet hours from Settings; otherwise the default 22:00-08:00.
  const quiet = prefs.quietHours;
  const checkIn = pickCheckIn({
    now, tasks, outcomes, lastNudgeAt: log, drift: await detectDrift(now),
    ...(quiet.enabled ? { quietStartHour: quiet.start, quietEndHour: quiet.end } : {}),
  });
  if (!checkIn) {
    prefs.checkInLog = log;
    return null;
  }

  await ensureConfigured();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: checkIn.title,
      body: checkIn.body,
      sound: false,
      data: { kind: "task", taskId: checkIn.taskId },
    },
    // Immediate, on the existing "reminders" channel created by ensureConfigured.
    trigger: { channelId: "reminders" },
  });
  prefs.checkInLog = { ...log, [checkIn.taskId]: now };
  return checkIn;
}
