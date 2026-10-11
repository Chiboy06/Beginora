// Beginora Service — TypeScript bridge to the Android foreground service.
// Keeps the app process alive so Android doesn't kill the LLM while in background.

import { NativeModules, Platform } from "react-native";

// Supports both the legacy VestaServiceModule name (from the base repo's
// compiled native code) and a future BeginoraServiceModule rename.
const mod =
  NativeModules.BeginoraServiceModule ?? NativeModules.VestaServiceModule;

const isAvailable = Platform.OS === "android" && !!mod;

export async function startBeginoraService(): Promise<void> {
  if (!isAvailable) return;
  await mod.startService();
}

export async function stopBeginoraService(): Promise<void> {
  if (!isAvailable) return;
  await mod.stopService();
}

export async function updateServiceNotification(status: string): Promise<void> {
  if (!isAvailable) return;
  await mod.updateNotification(status);
}

// Keep legacy export so chat-store.ts import still resolves without changes
export const startVestaService = startBeginoraService;
export const stopVestaService = stopBeginoraService;
