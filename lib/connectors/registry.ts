import type { ConnectorCapability, ConnectorDescriptor } from "./types";

/**
 * The registry is descriptive, not an agent tool marketplace. Orchestration
 * still validates arguments and requires approval before mutating actions.
 */
export const CONNECTOR_REGISTRY: readonly ConnectorDescriptor[] = [
  {
    id: "device-calendar",
    displayName: "Device calendar",
    description: "Review a bounded window of upcoming events or open the system calendar editor.",
    capabilities: ["calendar.read", "calendar.create", "calendar.reminder"],
    permissionKind: "calendar_read",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Selected event title, start/end time, optional location"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "Calendar access is requested only when you choose to review events. Event creation opens the device calendar editor; the calendar account/provider may sync an event you save.",
  },
  {
    id: "device-contacts",
    displayName: "Device contacts",
    description: "Look up a small set of matching names and phone numbers when you ask for contact help.",
    capabilities: ["contacts.read"],
    permissionKind: "contacts_read",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Names and phone numbers of matching contacts"],
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Contacts are read only after an explicit lookup and Android permission; matches are handled on this device.",
  },
  {
    id: "android-voice-input",
    displayName: "Android speech input",
    description: "Transcribe speech into an editable Beginora draft using the Android speech provider.",
    capabilities: ["voice.capture"],
    permissionKind: "microphone",
    permissionState: "not_requested",
    offline: false,
    dataRead: ["Spoken words you choose to capture"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "Microphone access is requested only when you tap voice input. The Android speech provider may use a network and applies its own processing/retention policy; Beginora never auto-sends the transcript.",
  },
  {
    id: "email-composer",
    displayName: "Email composer",
    description: "Prepare an editable draft in an email app installed on this device.",
    capabilities: ["email.compose"],
    permissionKind: "user_handoff",
    permissionState: "not_requested",
    offline: false,
    dataRead: ["Only the recipient, subject, and message you enter for this draft"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "Beginora opens the system email composer; it does not send. Review and send from your email app. Sending uses that app’s provider and network.",
  },
  {
    id: "local-reminders",
    displayName: "Local reminders",
    description: "Schedule one user-requested notification on this device.",
    capabilities: ["notifications.schedule"],
    permissionKind: "notifications",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Reminder text and selected reminder time"],
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Notification permission is requested only when you ask for a reminder; reminders can be cancelled in system settings.",
  },
  {
    id: "telegram-task-summaries",
    displayName: "Telegram task summaries",
    description: "Send a selected task title and first step only when you explicitly tap Send.",
    capabilities: ["telegram.send_summary"],
    permissionKind: "user_handoff",
    permissionState: "not_requested",
    offline: false,
    dataRead: ["Selected task title, first step, and configured Telegram chat ID"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "The bot token is stored in Android secure storage. Selected task text is sent to Telegram only after you request the send.",
  },
  {
    id: "app-updates",
    displayName: "App-code updates",
    description: "Check Expo EAS for compatible JavaScript and bundled-asset updates; not task-data sync.",
    capabilities: ["app_updates.check"],
    permissionKind: "none",
    permissionState: "unavailable",
    offline: false,
    dataRead: ["App version, runtime, update channel, and update status"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "Available only on a build linked to an EAS project. Downloaded updates are applied only after you confirm a restart.",
  },
  {
    id: "background-model",
    displayName: "Background model service",
    description: "Optionally keep a loaded on-device model available while Beginora is backgrounded.",
    capabilities: ["model.background"],
    permissionKind: "notifications",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Generic model-availability status; no task title is shown in the persistent notification"],
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Off by default. Enable in Settings to request Android notification permission and start the service; turn it off at any time.",
  },
  {
    id: "local-documents",
    displayName: "Local documents",
    description: "Search documents you explicitly import for this task.",
    capabilities: ["documents.read"],
    permissionKind: "user_handoff",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Only files you select and relevant retrieved excerpts"],
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Files stay on this device; a document is used only after you import/select it.",
  },
  {
    id: "on-device-model",
    displayName: "On-device model",
    description: "Generate a bounded task plan with the installed local model, with deterministic fallback.",
    capabilities: ["local_model.infer"],
    permissionKind: "none",
    permissionState: "granted",
    offline: true,
    dataRead: ["The task and optional context you submit for this plan"],
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Inference is user-triggered. Model output is validated and cannot execute a device action by itself.",
  },
  {
    id: "paired-mcp",
    displayName: "Paired local MCP clients",
    description: "Temporarily unavailable while encrypted transport and per-source controls are completed.",
    capabilities: ["mcp.read"],
    permissionKind: "user_handoff",
    permissionState: "unavailable",
    offline: true,
    dataRead: ["Contacts, calendar events, and document excerpts would be exposed to a paired client"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "The unencrypted local-network server is disabled in this build; legacy pairing credentials are revoked at app startup.",
  },
] as const;

export function getConnector(id: string): ConnectorDescriptor | undefined {
  return CONNECTOR_REGISTRY.find((connector) => connector.id === id);
}

export function listConnectors(): readonly ConnectorDescriptor[] {
  return CONNECTOR_REGISTRY;
}

export function connectorSupports(
  connectorId: string,
  capability: ConnectorCapability,
): boolean {
  return getConnector(connectorId)?.capabilities.includes(capability) ?? false;
}

export function getConnectorCapabilities(): readonly ConnectorCapability[] {
  return CONNECTOR_REGISTRY.flatMap((connector) => connector.capabilities);
}
