import {
  CONNECTOR_REGISTRY,
  connectorSupports,
  getConnector,
  getConnectorCapabilities,
} from "../registry";

describe("connector registry", () => {
  it("declares only the intended local and handoff capabilities", () => {
    expect(getConnectorCapabilities()).toEqual(expect.arrayContaining([
      "calendar.read",
      "calendar.create",
      "calendar.reminder",
      "contacts.read",
      "voice.capture",
      "email.compose",
      "telegram.send_summary",
      "app_updates.check",
      "model.background",
      "notifications.schedule",
      "documents.read",
      "local_model.infer",
      "mcp.read",
    ]));
    expect(getConnectorCapabilities()).not.toContain("email.send");
    expect(getConnectorCapabilities()).not.toContain("calendar.delete");
  });

  it("documents permission, data, and confirmation boundaries for every connector", () => {
    for (const connector of CONNECTOR_REGISTRY) {
      expect(connector.displayName.length).toBeGreaterThan(0);
      expect(connector.description.length).toBeGreaterThan(0);
      expect(connector.userControl.length).toBeGreaterThan(0);
      expect(connector.dataRead.length).toBeGreaterThan(0);
      expect(connector.confirmationRequired).toBe(true);
    }
  });

  it("discloses calendar-provider and communication-provider egress", () => {
    expect(getConnector("device-calendar")?.dataLeavesDevice).toBe(true);
    expect(getConnector("device-calendar")?.userControl).toContain("may sync");
    expect(getConnector("on-device-model")?.offline).toBe(true);
    expect(getConnector("email-composer")?.dataLeavesDevice).toBe(true);
    expect(getConnector("email-composer")?.permissionKind).toBe("user_handoff");
    expect(getConnector("android-voice-input")?.dataLeavesDevice).toBe(true);
    expect(getConnector("telegram-task-summaries")?.dataLeavesDevice).toBe(true);
    expect(getConnector("app-updates")?.permissionState).toBe("unavailable");
    expect(getConnector("paired-mcp")?.permissionState).toBe("unavailable");
  });

  it("answers capability lookups without exposing unknown connector ids", () => {
    expect(connectorSupports("device-calendar", "calendar.read")).toBe(true);
    expect(connectorSupports("device-calendar", "email.compose")).toBe(false);
    expect(connectorSupports("arbitrary", "email.compose")).toBe(false);
  });
});
