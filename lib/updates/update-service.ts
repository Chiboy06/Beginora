import * as Updates from "expo-updates";
import * as Network from "expo-network";

export type AppUpdateResult =
  | { status: "unavailable"; message: string }
  | { status: "offline"; message: string }
  | { status: "up_to_date"; message: string }
  | { status: "update_ready"; message: string }
  | { status: "failed"; message: string };

/** OTA updates can change JavaScript/assets only; native-module changes still need a new APK. */
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
    const network = await Network.getNetworkStateAsync();
    if (network.isConnected === false || network.isInternetReachable === false) {
      return {
        status: "offline",
        message: "Connect to the internet to check for a compatible Beginora update. Your app and local tasks are unchanged.",
      };
    }

    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) {
      return { status: "up_to_date", message: "You’re already using the latest available version." };
    }

    const download = await Updates.fetchUpdateAsync();
    if (!download.isNew) {
      return { status: "up_to_date", message: "No newer compatible app update was found." };
    }

    return {
      status: "update_ready",
      message: "A compatible code update is downloaded. Restart Beginora when you’re ready to apply it.",
    };
  } catch {
    return {
      status: "failed",
      message: "I couldn’t check for an update right now. Your current app and local data are unchanged.",
    };
  }
}

// Restart the app's JavaScript (local data is kept), e.g. to apply a new theme.
// False when this build cannot restart itself; the user then reopens the app.
export async function restartApp(): Promise<boolean> {
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

/** Apply only after the user confirms; this restarts JS and preserves local SQLite data. */
export async function applyDownloadedAppUpdate(): Promise<void> {
  if (!Updates.isEnabled) throw new Error("Over-the-air updates are not connected in this build.");
  await Updates.reloadAsync();
}
