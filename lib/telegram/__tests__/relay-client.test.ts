const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import { relayUrl, startRelayLink, relayStatus, relaySend, RelayError } from "../relay-client";
import { prefs } from "../../store/prefs";

const realFetch = global.fetch;

function respond(status: number, body: unknown) {
  return jest.fn(async () => ({ ok: status < 400, status, json: async () => body }));
}

beforeEach(() => {
  mockStore.clear();
  prefs.telegramRelayLinked = false;
  process.env.EXPO_PUBLIC_TELEGRAM_RELAY_URL = "https://relay.example.workers.dev/";
});
afterEach(() => { global.fetch = realFetch; });

test("only an https relay address is used", () => {
  expect(relayUrl("https://relay.example.workers.dev/")).toBe("https://relay.example.workers.dev");
  expect(relayUrl("http://relay.example.workers.dev")).toBeNull();
  expect(relayUrl("")).toBeNull();
});

test("connecting stores this phone's credentials and returns the Telegram link", async () => {
  global.fetch = respond(200, { deviceId: "dev1", secret: "s3cret", code: "c", deepLink: "https://t.me/BeginoraBot?start=c" }) as unknown as typeof fetch;
  expect(await startRelayLink()).toBe("https://t.me/BeginoraBot?start=c");
  expect(mockStore.get("telegram_relay_auth")).toBe("dev1.s3cret");
});

test("status sends the credentials as a bearer header and records the link", async () => {
  mockStore.set("telegram_relay_auth", "dev1.s3cret");
  const fetchMock = respond(200, { linked: true, name: "Chi" });
  global.fetch = fetchMock as unknown as typeof fetch;
  expect(await relayStatus()).toEqual({ linked: true, name: "Chi" });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://relay.example.workers.dev/status");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer dev1.s3cret");
  expect(prefs.telegramRelayLinked).toBe(true);
});

test("a forgotten device clears its credentials", async () => {
  mockStore.set("telegram_relay_auth", "dev1.s3cret");
  prefs.telegramRelayLinked = true;
  global.fetch = respond(401, { error: "Unknown device." }) as unknown as typeof fetch;
  await expect(relaySend("hi")).rejects.toBeInstanceOf(RelayError);
  expect(mockStore.has("telegram_relay_auth")).toBe(false);
  expect(prefs.telegramRelayLinked).toBe(false);
});
