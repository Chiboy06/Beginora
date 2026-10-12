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

interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

function apiBase(): string {
  return (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "";
}

function isLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return !!ipv4 && Number(ipv4[1]) === 127 && ipv4.slice(1).every((part) => Number(part) <= 255);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuthSession(value: unknown): AuthSession | null {
  if (!isRecord(value)) return null;
  const { accessToken, refreshToken, user } = value;
  if (!isNonEmptyString(accessToken) || !isNonEmptyString(refreshToken) || !isRecord(user)) return null;
  if (!isNonEmptyString(user.id) || !isNonEmptyString(user.email)) return null;
  if (user.displayName !== null && typeof user.displayName !== "string") return null;
  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  };
}

function responseError(value: unknown, fallback: string): string {
  return isRecord(value) && isNonEmptyString(value.error) ? value.error : fallback;
}

async function persistAuthSession(session: AuthSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_ACCESS, session.accessToken);
    await SecureStore.setItemAsync(KEY_REFRESH, session.refreshToken);
    await SecureStore.setItemAsync(KEY_USER, JSON.stringify(session.user));
  } catch (error) {
    // Do not leave a partial session (for example an access token without its
    // refresh token) if secure storage fails partway through persistence.
    await Promise.all([
      SecureStore.deleteItemAsync(KEY_ACCESS).catch(() => {}),
      SecureStore.deleteItemAsync(KEY_REFRESH).catch(() => {}),
      SecureStore.deleteItemAsync(KEY_USER).catch(() => {}),
    ]);
    throw error;
  }
}

async function post(
  path: string,
  body: object,
  token?: string,
): Promise<Response> {
  const base = apiBase().trim();
  if (!base) throw new Error("API_URL is not configured.");

  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error("API_URL must be a valid absolute URL.");
  }
  if (parsed.username || parsed.password ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname)))) {
    throw new Error("API_URL must use HTTPS unless it points to a loopback address.");
  }

  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function authenticate(
  path: "/auth/signup" | "/auth/signin",
  requestBody: object,
  fallback: string,
): Promise<AuthResult> {
  try {
    const res = await post(path, requestBody);
    const data: unknown = await res.json();
    if (!res.ok) return { ok: false, error: responseError(data, `${fallback} (${res.status})`) };

    const session = parseAuthSession(data);
    if (!session) return { ok: false, error: "Invalid authentication response." };

    await persistAuthSession(session);
    return { ok: true, user: session.user };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function signUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  return authenticate("/auth/signup", { email, password, displayName }, "Sign-up failed");
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthResult> {
  return authenticate("/auth/signin", { email, password }, "Sign-in failed");
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
    if (!isNonEmptyString(refreshToken)) return null;
    const res = await post("/auth/refresh", { refreshToken });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isRecord(data) || !isNonEmptyString(data.accessToken)) return null;
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
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.email) ||
        (value.displayName !== null && typeof value.displayName !== "string")) return null;
    return {
      id: value.id,
      email: value.email,
      displayName: value.displayName,
    };
  } catch {
    return null;
  }
}

export async function isSignedIn(): Promise<boolean> {
  const token = await getAccessToken();
  return isNonEmptyString(token);
}
