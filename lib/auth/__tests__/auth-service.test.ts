jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { apiUrl: "https://api.example.test" } } },
}));

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { isSignedIn, refreshAccessToken, signIn } from "../auth-service";

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const constants = Constants as unknown as { expoConfig: { extra: { apiUrl: string } } };
const mockFetch = jest.fn();
const storedItems = new Map<string, string>();

const validSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: { id: "user-1", email: "person@example.test", displayName: "Person" },
};

beforeEach(() => {
  jest.clearAllMocks();
  storedItems.clear();
  constants.expoConfig.extra.apiUrl = "https://api.example.test";
  (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as typeof fetch;
  secureStore.getItemAsync.mockImplementation(async (key) => storedItems.get(key) ?? null);
  secureStore.setItemAsync.mockImplementation(async (key, value) => {
    storedItems.set(key, value);
  });
  secureStore.deleteItemAsync.mockImplementation(async (key) => {
    storedItems.delete(key);
  });
});

test("rejects non-loopback HTTP API URLs before sending credentials", async () => {
  constants.expoConfig.extra.apiUrl = "http://api.example.test";

  const result = await signIn("person@example.test", "secret-password");

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/HTTPS/);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  await expect(isSignedIn()).resolves.toBe(false);
});

test("stores a complete successful token response", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => validSession,
  } as Response);

  const result = await signIn("person@example.test", "secret-password");

  expect(result).toEqual({ ok: true, user: validSession.user });
  expect(mockFetch).toHaveBeenCalledWith("https://api.example.test/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.test", password: "secret-password" }),
  });
  expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(1, "auth_access_token", "access-token");
  expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(2, "auth_refresh_token", "refresh-token");
  expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(3, "auth_user", JSON.stringify(validSession.user));
  await expect(isSignedIn()).resolves.toBe(true);
});

test("does not persist or sign in after an incomplete 2xx response", async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ accessToken: "access-token", user: validSession.user }),
  } as Response);

  const result = await signIn("person@example.test", "secret-password");

  expect(result).toEqual({ ok: false, error: "Invalid authentication response." });
  expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  await expect(isSignedIn()).resolves.toBe(false);
});

test("returns null and preserves the current access token when refresh fails", async () => {
  storedItems.set("auth_refresh_token", "refresh-token");
  storedItems.set("auth_access_token", "previous-access-token");
  mockFetch.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: "Unavailable" }),
  } as Response);

  await expect(refreshAccessToken()).resolves.toBeNull();

  expect(mockFetch).toHaveBeenCalledWith("https://api.example.test/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: "refresh-token" }),
  });
  expect(secureStore.setItemAsync).not.toHaveBeenCalled();
  expect(storedItems.get("auth_access_token")).toBe("previous-access-token");
});
