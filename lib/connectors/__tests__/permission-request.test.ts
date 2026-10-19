jest.mock("expo-calendar/legacy", () => ({ requestCalendarPermissionsAsync: jest.fn() }));
jest.mock("expo-contacts/legacy", () => ({ requestPermissionsAsync: jest.fn() }));
jest.mock("expo-notifications", () => ({ requestPermissionsAsync: jest.fn() }));
jest.mock("expo-mail-composer", () => ({}));
jest.mock("expo-updates", () => ({}));
jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  PermissionsAndroid: {
    PERMISSIONS: { RECORD_AUDIO: "android.permission.RECORD_AUDIO" },
    RESULTS: { GRANTED: "granted", DENIED: "denied", NEVER_ASK_AGAIN: "never_ask_again" },
    request: jest.fn(),
  },
}));
jest.mock("../../telegram/telegram-service", () => ({}));
jest.mock("../../store/prefs", () => ({ prefs: {} }));

import * as Calendar from "expo-calendar/legacy";
import * as Contacts from "expo-contacts/legacy";
import * as Notifications from "expo-notifications";
import { PermissionsAndroid } from "react-native";
import { REQUESTABLE_CONNECTORS, requestConnectorPermission } from "../permission-service";

const granted = { granted: true, canAskAgain: true };
const blocked = { granted: false, canAskAgain: false };

beforeEach(() => jest.clearAllMocks());

test("calendar, contacts and notifications use their own Android prompts", async () => {
  (Calendar.requestCalendarPermissionsAsync as jest.Mock).mockResolvedValue(granted);
  (Contacts.requestPermissionsAsync as jest.Mock).mockResolvedValue(blocked);
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });

  expect(await requestConnectorPermission("device-calendar")).toBe("granted");
  expect(await requestConnectorPermission("device-contacts")).toBe("denied");
  expect(await requestConnectorPermission("local-reminders")).toBe("not_requested");
});

test("microphone maps 'never ask again' to denied so the UI offers Settings", async () => {
  (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce("granted").mockResolvedValueOnce("never_ask_again").mockResolvedValueOnce("denied");
  expect(await requestConnectorPermission("android-voice-input")).toBe("granted");
  expect(await requestConnectorPermission("android-voice-input")).toBe("denied");
  expect(await requestConnectorPermission("android-voice-input")).toBe("not_granted");
  expect(PermissionsAndroid.request).toHaveBeenCalledWith("android.permission.RECORD_AUDIO");
});

test("connectors without an Android permission prompt nothing", async () => {
  expect(await requestConnectorPermission("email-composer")).toBeNull();
  expect(REQUESTABLE_CONNECTORS.has("email-composer")).toBe(false);
  expect([...REQUESTABLE_CONNECTORS].sort()).toEqual(["android-voice-input", "device-calendar", "device-contacts", "local-reminders"]);
});
