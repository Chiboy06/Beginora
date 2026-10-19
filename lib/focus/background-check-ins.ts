// Periodic background scan for gentle check-ins (Android WorkManager via
// expo-background-task). Imported from index.ts so the task is defined at
// startup, including when Android starts the app headless to run it.

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { runCheckInScan } from "./check-in-runner";

export const CHECK_IN_TASK = "beginora-check-ins";
// Android's minimum; the system treats it as a lower bound, not a schedule.
const INTERVAL_MINUTES = 15;

TaskManager.defineTask(CHECK_IN_TASK, async () => {
  try {
    await runCheckInScan();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (err) {
    console.warn("[check-ins] background scan failed:", err);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setCheckInsScheduled(enabled: boolean): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(CHECK_IN_TASK);
  // Re-registering a registered task can cancel a running worker (expo/expo#51246).
  if (enabled && !registered) {
    await BackgroundTask.registerTaskAsync(CHECK_IN_TASK, { minimumInterval: INTERVAL_MINUTES });
  } else if (!enabled && registered) {
    await BackgroundTask.unregisterTaskAsync(CHECK_IN_TASK);
  }
}
