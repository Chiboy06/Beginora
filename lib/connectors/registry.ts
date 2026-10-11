import type { ConnectorCapability, ConnectorDescriptor } from "./types";

/**
 * The registry is intentionally descriptive, not an agent tool marketplace.
 * Orchestration must still validate arguments and require approval before any
 * mutating action. Integrations only receive the minimum selected data.
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
    dataLeavesDevice: false,
    confirmationRequired: true,
    userControl: "Calendar access is requested only when you choose to review events. Event creation opens the device calendar editor, where you save or cancel.",
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
    description: "Expose only allowlisted read-only data to a client you explicitly pair on your local network.",
    capabilities: ["mcp.read"],
    permissionKind: "user_handoff",
    permissionState: "not_requested",
    offline: true,
    dataRead: ["Only the individual read-only source you enable"],
    dataLeavesDevice: true,
    confirmationRequired: true,
    userControl: "The server is off by default; pairing and data exposure require explicit user action.",
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
