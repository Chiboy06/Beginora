import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import * as MailComposer from "expo-mail-composer";
import type { ConnectorPermissionState } from "./types";

export type ConnectorPermissionMap = Record<string, ConnectorPermissionState>;

function permissionState(response: { granted: boolean; canAskAgain?: boolean }): ConnectorPermissionState {
  if (response.granted) return "granted";
  return response.canAskAgain === false ? "denied" : "not_requested";
}

/** Reads current statuses only; it never opens an OS permission prompt. */
export async function readConnectorPermissionStates(): Promise<ConnectorPermissionMap> {
  const entries = await Promise.allSettled([
    Calendar.getCalendarPermissionsAsync(),
    Notifications.getPermissionsAsync(),
    MailComposer.isAvailableAsync(),
  ]);
  const calendar = entries[0].status === "fulfilled"
    ? permissionState(entries[0].value)
    : "unavailable";
  const notifications = entries[1].status === "fulfilled"
    ? permissionState(entries[1].value)
    : "unavailable";
  const email = entries[2].status === "fulfilled"
    ? (entries[2].value ? "available" : "unavailable")
    : "unavailable";

  return {
    "device-calendar": calendar,
    "local-reminders": notifications,
    "email-composer": email,
    "local-documents": "available",
    "on-device-model": "available",
    "paired-mcp": "not_requested",
  };
}
