export type ConnectorCapability =
  | "calendar.read"
  | "calendar.create"
  | "calendar.reminder"
  | "email.compose"
  | "notifications.schedule"
  | "documents.read"
  | "local_model.infer"
  | "mcp.read";

export type ConnectorPermissionState =
  | "unavailable"
  | "available"
  | "not_requested"
  | "granted"
  | "denied"
  | "revoked";

export type ConnectorPermissionKind =
  | "none"
  | "calendar_read"
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
