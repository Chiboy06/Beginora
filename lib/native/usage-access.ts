// Bridge to the Usage access methods in SystemActionsModule (Android only).

import { NativeModules, Platform } from "react-native";
import type { AppEvent } from "../focus/usage-signals";

const mod = Platform.OS === "android" ? NativeModules.SystemActionsModule : null;

export async function hasUsageAccess(): Promise<boolean> {
  if (!mod?.hasUsageAccess) return false;
  try {
    return (await mod.hasUsageAccess()) === true;
  } catch {
    return false;
  }
}

export async function openUsageAccessSettings(): Promise<void> {
  if (!mod?.openUsageAccessSettings) throw new Error("Usage access is only available on Android.");
  await mod.openUsageAccessSettings();
}

export async function getAppEvents(sinceMs: number): Promise<AppEvent[]> {
  if (!mod?.getAppEvents) return [];
  return (await mod.getAppEvents(sinceMs)) as AppEvent[];
}
