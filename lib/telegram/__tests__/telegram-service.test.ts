jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("../../storage/database", () => ({
  getConfig: jest.fn(),
  setConfig: jest.fn(async () => {}),
  deleteConfig: jest.fn(async () => {}),
}));

import * as SecureStore from "expo-secure-store";
import { deleteConfig, getConfig, setConfig } from "../../storage/database";
import { getTelegramConfig, saveTelegramConfig } from "../telegram-service";

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const dbGet = getConfig as jest.MockedFunction<typeof getConfig>;
const dbSet = setConfig as jest.MockedFunction<typeof setConfig>;
const dbDelete = deleteConfig as jest.MockedFunction<typeof deleteConfig>;

beforeEach(() => {
  jest.clearAllMocks();
  secureStore.getItemAsync.mockResolvedValue(null);
  dbGet.mockImplementation(async (key) => key === "telegram_bot_token" ? null : null);
});

test("migrates a legacy SQLite token to secure storage and removes the plaintext row", async () => {
  dbGet.mockImplementation(async (key) => {
    if (key === "telegram_bot_token") return "legacy-token";
    if (key === "telegram_chat_id") return "123";
    if (key === "telegram_enabled") return "true";
    return null;
  });
  await expect(getTelegramConfig()).resolves.toEqual({ botToken: "legacy-token", chatId: "123", enabled: true });
  expect(secureStore.setItemAsync).toHaveBeenCalledWith("telegram_bot_token", "legacy-token");
  expect(dbDelete).toHaveBeenCalledWith("telegram_bot_token");
});

test("writes the token only to SecureStore and keeps non-secret settings in SQLite", async () => {
  await saveTelegramConfig({ botToken: "new-token", chatId: "987", enabled: true });
  expect(secureStore.setItemAsync).toHaveBeenCalledWith("telegram_bot_token", "new-token");
  expect(dbSet).toHaveBeenCalledWith("telegram_chat_id", "987");
  expect(dbSet).toHaveBeenCalledWith("telegram_enabled", "true");
  expect(dbSet).not.toHaveBeenCalledWith("telegram_bot_token", expect.anything());
  expect(dbDelete).toHaveBeenCalledWith("telegram_bot_token");
});
