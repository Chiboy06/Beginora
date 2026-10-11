// Authentication service — sign-up, sign-in, sign-out, token refresh.
// Tokens stored in expo-secure-store (encrypted at rest).
// Cloud sync and auth are off by default; safe to import without side effects.

import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const KEY_ACCESS = "auth_access_token";
const KEY_REFRESH = "auth_refresh_token";
const KEY_USER = "auth_user";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  error?: string;
}

function apiBase(): string {
  return (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "";
}

async function post(
  path: string,
  body: object,
  token?: string,
): Promise<Response> {
  const base = apiBase();
  if (!base) throw new Error("API_URL is not configured.");
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export async function signUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  try {
    const res = await post("/auth/signup", { email, password, displayName });
    const data = await res.json() as {
      accessToken?: string;
      refreshToken?: string;
      user?: AuthUser;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: data.error ?? `Sign-up failed (${res.status})` };
    await SecureStore.setItemAsync(KEY_ACCESS, data.accessToken ?? "");
    await SecureStore.setItemAsync(KEY_REFRESH, data.refreshToken ?? "");
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(data.user));
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  try {
    const res = await post("/auth/signin", { email, password });
    const data = await res.json() as {
      accessToken?: string;
      refreshToken?: string;
      user?: AuthUser;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: data.error ?? `Sign-in failed (${res.status})` };
    await SecureStore.setItemAsync(KEY_ACCESS, data.accessToken ?? "");
    await SecureStore.setItemAsync(KEY_REFRESH, data.refreshToken ?? "");
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(data.user));
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function signOut(): Promise<void> {
  const token = await getAccessToken();
  if (token) post("/auth/signout", {}, token).catch(() => {});
  await SecureStore.deleteItemAsync(KEY_ACCESS);
  await SecureStore.deleteItemAsync(KEY_REFRESH);
  await SecureStore.deleteItemAsync(KEY_USER);
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = await SecureStore.getItemAsync(KEY_REFRESH);
    if (!refreshToken) return null;
    const res = await post("/auth/refresh", { refreshToken });
    const data = await res.json() as { accessToken?: string };
    if (!res.ok || !data.accessToken) return null;
    await SecureStore.setItemAsync(KEY_ACCESS, data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_ACCESS);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_USER);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export async function isSignedIn(): Promise<boolean> {
  const token = await getAccessToken();
  return !!token;
}
