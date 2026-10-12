// Offline-first sync service.
// Processes the sync_queue table only when runtime configuration, user consent,
// and an authenticated session are all present. Safe to import without effects.

import Constants from "expo-constants";
import { getAccessToken, refreshAccessToken } from "../auth/auth-service";
import { getDatabase } from "../storage/database";
import { prefs } from "../store/prefs";

interface SyncQueueRow {
  id: string;
  entity: string;
  entity_id: string;
  operation: "upsert" | "delete";
  payload: string;
  attempts: number;
  next_retry: number;
}

interface RuntimeExtra {
  apiUrl?: unknown;
  enableCloudSync?: unknown;
}

const BASE_DELAY_MS = 5_000;
const MAX_ATTEMPTS = 5;
let running = false;

class AuthenticationRequiredError extends Error {}

function getSyncApiUrl(): string | null {
  const extra = Constants.expoConfig?.extra as RuntimeExtra | undefined;
  if (extra?.enableCloudSync !== true || typeof extra.apiUrl !== "string") return null;

  const configuredUrl = extra.apiUrl.trim();
  if (!configuredUrl) return null;

  try {
    const parsed = new URL(configuredUrl);
    // Cloud task content must never be sent over plaintext HTTP.
    if (parsed.protocol !== "https:") return null;
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function getPendingItems(): Promise<SyncQueueRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<SyncQueueRow>(
    "SELECT * FROM sync_queue WHERE next_retry <= ? AND attempts < ? ORDER BY next_retry ASC LIMIT 20",
    Date.now(),
    MAX_ATTEMPTS,
  );
}

async function markSuccess(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", id);
}

async function markFailed(id: string, attempts: number, error: string): Promise<void> {
  const db = await getDatabase();
  const nextRetry = Date.now() + BASE_DELAY_MS * Math.pow(2, attempts);
  await db.runAsync(
    "UPDATE sync_queue SET attempts = ?, last_error = ?, next_retry = ? WHERE id = ?",
    attempts + 1,
    error,
    nextRetry,
    id,
  );
}

async function postItem(
  item: SyncQueueRow,
  apiUrl: string,
  token: string,
): Promise<Response> {
  return fetch(`${apiUrl}/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      entity: item.entity,
      entityId: item.entity_id,
      operation: item.operation,
      payload: JSON.parse(item.payload),
    }),
  });
}

async function processItem(
  item: SyncQueueRow,
  apiUrl: string,
  initialToken: string,
): Promise<string> {
  let token = initialToken;
  let res = await postItem(item, apiUrl, token);

  if (res.status === 401) {
    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) throw new AuthenticationRequiredError("Sign-in required for cloud sync.");
    token = refreshedToken;
    res = await postItem(item, apiUrl, token);
  }

  if (res.status === 401 || res.status === 403) {
    throw new AuthenticationRequiredError("Sign-in required for cloud sync.");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return token;
}

export async function runSyncCycle(): Promise<void> {
  if (!prefs.cloudSyncEnabled) return;

  const apiUrl = getSyncApiUrl();
  if (!apiUrl) return;

  let token = await getAccessToken();
  if (!token) return;

  const items = await getPendingItems();
  for (const item of items) {
    try {
      token = await processItem(item, apiUrl, token);
      await markSuccess(item.id);
    } catch (err) {
      // An expired or revoked session is not a failed task upload. Keep the
      // queue untouched until the user signs in again.
      if (err instanceof AuthenticationRequiredError) break;
      await markFailed(item.id, item.attempts, err instanceof Error ? err.message : "Sync request failed");
    }
  }
}

export function startSyncService(intervalMs = 30_000): () => void {
  if (running) return () => {};
  running = true;
  const timer = setInterval(() => {
    runSyncCycle().catch(() => {});
  }, intervalMs);
  return () => {
    running = false;
    clearInterval(timer);
  };
}
