jest.mock("expo-calendar/legacy", () => ({ getCalendarPermissionsAsync: jest.fn() }));
jest.mock("expo-contacts/legacy", () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: jest.fn() }));
jest.mock("expo-mail-composer", () => ({ isAvailableAsync: jest.fn() }));
jest.mock("expo-updates", () => ({ isEnabled: true }));
jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  PermissionsAndroid: {
    PERMISSIONS: { RECORD_AUDIO: "android.permission.RECORD_AUDIO" },
    check: jest.fn(),
  },
}));
jest.mock("../../telegram/telegram-service", () => ({ getTelegramConfig: jest.fn() }));
jest.mock("../../store/prefs", () => ({ prefs: { keepModelInBackground: true } }));

import * as Calendar from "expo-calendar/legacy";
import * as Contacts from "expo-contacts/legacy";
import * as Notifications from "expo-notifications";
import * as MailComposer from "expo-mail-composer";
import { PermissionsAndroid } from "react-native";
import { getTelegramConfig } from "../../telegram/telegram-service";
import { readConnectorPermissionStates } from "../permission-service";

const calendarPermissions = jest.mocked(Calendar.getCalendarPermissionsAsync);
const contactPermissions = jest.mocked(Contacts.getPermissionsAsync);
const contactPermissionPrompt = jest.mocked(Contacts.requestPermissionsAsync);
const notificationPermissions = jest.mocked(Notifications.getPermissionsAsync);
const emailAvailable = jest.mocked(MailComposer.isAvailableAsync);
const voicePermission = jest.mocked(PermissionsAndroid.check);
const telegramConfig = jest.mocked(getTelegramConfig);

describe("connector permission status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calendarPermissions.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" as never, expires: "never" });
    contactPermissions.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" as never, expires: "never" });
    notificationPermissions.mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" as never, expires: "never" });
    emailAvailable.mockResolvedValue(true);
    voicePermission.mockResolvedValue(true);
    telegramConfig.mockResolvedValue({ botToken: "private-token", chatId: "private-chat", enabled: true });
  });

  it("reports live readiness without revealing credentials or opening prompts", async () => {
    const states = await readConnectorPermissionStates();
    expect(states).toMatchObject({
      "device-calendar": "granted",
      "device-contacts": "denied",
      "android-voice-input": "granted",
      "local-reminders": "granted",
      "background-model": "granted",
      "telegram-task-summaries": "available",
      "app-updates": "available",
      "email-composer": "available",
      "paired-mcp": "unavailable",
    });
    expect(JSON.stringify(states)).not.toContain("private-token");
    expect(JSON.stringify(states)).not.toContain("private-chat");
    expect(contactPermissionPrompt).not.toHaveBeenCalled();
  });

  it("distinguishes configured-but-disabled Telegram from a missing setup", async () => {
    telegramConfig.mockResolvedValue({ botToken: "private-token", chatId: "private-chat", enabled: false });
    voicePermission.mockResolvedValue(false);
    notificationPermissions.mockResolvedValue({ granted: false, canAskAgain: false, status: "denied" as never, expires: "never" });

    const states = await readConnectorPermissionStates();
    expect(states["telegram-task-summaries"]).toBe("disabled");
    expect(states["android-voice-input"]).toBe("not_granted");
    expect(states["local-reminders"]).toBe("denied");
    expect(states["background-model"]).toBe("denied");
    expect(contactPermissionPrompt).not.toHaveBeenCalled();
  });
});
