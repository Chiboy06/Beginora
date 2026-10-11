import * as Updates from "expo-updates";

export type AppUpdateResult =
  | { status: "unavailable"; message: string }
  | { status: "up_to_date"; message: string }
  | { status: "reloading"; message: string }
  | { status: "failed"; message: string };

/** OTA updates can change JS/assets only; native-module changes still need a new APK. */
export async function checkForAppUpdate(): Promise<AppUpdateResult> {
  if (__DEV__) {
    return {
      status: "unavailable",
      message: "App updates can be checked from an installed release build, not the development server.",
    };
  }
  if (!Updates.isEnabled) {
    return {
      status: "unavailable",
      message: "Over-the-air updates are not connected yet. The app remains usable offline.",
    };
  }

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return { status: "up_to_date", message: "You’re already using the latest available version." };
    }

    const download = await Updates.fetchUpdateAsync();
    if (!download.isNew) {
      return { status: "up_to_date", message: "No newer compatible app update was found." };
    }

    await Updates.reloadAsync();
    return { status: "reloading", message: "The update is ready. Restarting Beginora now." };
  } catch {
    return {
      status: "failed",
      message: "I couldn’t check for an update right now. Your current app and local data are unchanged.",
    };
  }
}
