// The phone side of the shared Beginora bot (relay/src/worker.js). The relay
// address comes from the build (EXPO_PUBLIC_TELEGRAM_RELAY_URL); this phone's
// device ID and secret live in SecureStore.

import * as SecureStore from "expo-secure-store";
import { prefs } from "../store/prefs";

const AUTH_KEY = "telegram_relay_auth";
const TIMEOUT_MS = 15_000;

// https only: the device secret travels in every request.
export function relayUrl(raw = process.env.EXPO_PUBLIC_TELEGRAM_RELAY_URL ?? ""): string | null {
  const url = raw.trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+/.test(url) ? url : null;
}

export class RelayError extends Error {}

async function request(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<any> {
  const base = relayUrl();
  if (!base) throw new RelayError("The Beginora bot is not set up in this build.");
  const auth = init.auth === false ? null : await SecureStore.getItemAsync(AUTH_KEY);
  if (init.auth !== false && !auth) throw new RelayError("Not connected to Telegram.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new RelayError("Could not reach the Beginora bot. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // The relay forgot this phone (/stop in Telegram, or a newer phone linked).
    await SecureStore.deleteItemAsync(AUTH_KEY).catch(() => {});
    prefs.telegramRelayLinked = false;
    throw new RelayError("This phone is no longer connected. Connect again.");
  }
  if (!res.ok) throw new RelayError(typeof data?.error === "string" ? data.error : `Relay error (${res.status}).`);
  return data;
}

// Step 1 of connecting: returns the t.me link that opens the bot with this phone's code.
export async function startRelayLink(): Promise<string> {
  const data = await request("/link", { method: "POST", auth: false });
  if (typeof data?.deviceId !== "string" || typeof data?.secret !== "string" || typeof data?.deepLink !== "string") {
    throw new RelayError("The Beginora bot sent an unexpected reply.");
  }
  await SecureStore.setItemAsync(AUTH_KEY, `${data.deviceId}.${data.secret}`);
  prefs.telegramRelayLinked = false;
  return data.deepLink;
}

export async function relayStatus(): Promise<{ linked: boolean; name: string }> {
  const data = await request("/status");
  const linked = data?.linked === true;
  prefs.telegramRelayLinked = linked;
  return { linked, name: typeof data?.name === "string" ? data.name : "" };
}

export async function relaySend(text: string, html = false): Promise<void> {
  await request("/send", { method: "POST", body: { text, html } });
}

export async function relayInbox(): Promise<string[]> {
  const data = await request("/inbox");
  return Array.isArray(data?.messages) ? data.messages.map((m: { text?: unknown }) => String(m?.text ?? "")).filter(Boolean) : [];
}

export async function relayUnlink(): Promise<void> {
  try {
    await request("/unlink", { method: "POST" });
  } finally {
    await SecureStore.deleteItemAsync(AUTH_KEY).catch(() => {});
    prefs.telegramRelayLinked = false;
  }
}
