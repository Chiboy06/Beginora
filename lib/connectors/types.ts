export type ConnectorCapability =
  | "calendar.read"
  | "calendar.create"
  | "calendar.reminder"
  | "contacts.read"
  | "voice.capture"
  | "email.compose"
  | "telegram.send_summary"
  | "app_updates.check"
  | "model.background"
  | "notifications.schedule"
  | "documents.read"
  | "local_model.infer"
  | "mcp.read";

export type ConnectorPermissionState =
  | "unavailable"
  | "available"
  | "not_requested"
  | "not_granted"
  | "disabled"
  | "granted"
  | "denied"
  | "revoked";

export type ConnectorPermissionKind =
  | "none"
  | "calendar_read"
  | "contacts_read"
  | "microphone"
  | "notifications"
  | "user_handoff";

export interface ConnectorDescriptor {
  id: string;
  displayName: string;
  description: string;
  capabilities: readonly ConnectorCapability[];
  permissionKind: ConnectorPermissionKind;
  permissionState: ConnectorPermissionState;
  offline: boolean;
  dataRead: readonly string[];
  dataLeavesDevice: boolean;
  confirmationRequired: boolean;
  userControl: string;
}
