import * as Calendar from "expo-calendar/legacy";
import * as Contacts from "expo-contacts/legacy";
import * as Notifications from "expo-notifications";
import * as MailComposer from "expo-mail-composer";
import * as Updates from "expo-updates";
import { PermissionsAndroid, Platform } from "react-native";
import type { ConnectorPermissionState } from "./types";
import { getTelegramConfig } from "../telegram/telegram-service";
import { prefs } from "../store/prefs";

export type ConnectorPermissionMap = Record<string, ConnectorPermissionState>;

function permissionState(response: { granted: boolean; canAskAgain?: boolean }): ConnectorPermissionState {
  if (response.granted) return "granted";
  return response.canAskAgain === false ? "denied" : "not_requested";
}

// Connectors whose Android permission the user can grant with one tap.
export const REQUESTABLE_CONNECTORS = new Set([
  "device-calendar",
  "device-contacts",
  "android-voice-input",
  "local-reminders",
]);

/** Shows the Android permission prompt for one connector and returns the result. */
export async function requestConnectorPermission(id: string): Promise<ConnectorPermissionState | null> {
  switch (id) {
    case "device-calendar":
      return permissionState(await Calendar.requestCalendarPermissionsAsync());
    case "device-contacts":
      return permissionState(await Contacts.requestPermissionsAsync());
    case "local-reminders":
      return permissionState(await Notifications.requestPermissionsAsync());
    case "android-voice-input": {
      if (Platform.OS !== "android") return "unavailable";
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "denied" : "not_granted";
    }
    default:
      return null;
  }
}

/** Reads current statuses only; it never opens an OS permission prompt. */
export async function readConnectorPermissionStates(): Promise<ConnectorPermissionMap> {
  const entries = await Promise.allSettled([
    Calendar.getCalendarPermissionsAsync(),
    Contacts.getPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    MailComposer.isAvailableAsync(),
    getTelegramConfig(),
  ]);
  const calendar = entries[0].status === "fulfilled"
    ? permissionState(entries[0].value)
    : "unavailable";
  const contacts = entries[1].status === "fulfilled"
    ? permissionState(entries[1].value)
    : "unavailable";
  const notifications = entries[2].status === "fulfilled"
    ? permissionState(entries[2].value)
    : "unavailable";
  const email = entries[3].status === "fulfilled"
    ? (entries[3].value ? "available" : "unavailable")
    : "unavailable";
  const telegram = entries[4].status === "fulfilled"
    ? (entries[4].value.enabled && entries[4].value.botToken && entries[4].value.chatId
      ? "available"
      : entries[4].value.botToken || entries[4].value.chatId ? "disabled" : "not_requested")
    : "unavailable";
  const voice = Platform.OS === "android"
    ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)
      .then((granted) => granted ? "granted" : "not_granted" as const)
      .catch(() => "unavailable" as const)
    : "unavailable";

  return {
    "device-calendar": calendar,
    "device-contacts": contacts,
    "android-voice-input": voice,
    "local-reminders": notifications,
    "background-model": prefs.keepModelInBackground ? notifications : "not_requested",
    "telegram-task-summaries": telegram,
    "app-updates": Updates.isEnabled ? "available" : "unavailable",
    "email-composer": email,
    "local-documents": "available",
    "on-device-model": "available",
    "paired-mcp": "unavailable",
  };
}
