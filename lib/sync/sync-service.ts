// Offline-first sync service.
// Processes the sync_queue table when cloud sync is enabled.
// Cloud sync is intentionally off for the current prototype (ENABLE_CLOUD_SYNC=false).
// This module is safe to import; it does nothing until explicitly started.

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

const BASE_DELAY_MS = 5_000;
const MAX_ATTEMPTS = 5;
let running = false;

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

async function processItem(item: SyncQueueRow, apiUrl: string): Promise<void> {
  const res = await fetch(`${apiUrl}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity: item.entity,
      entityId: item.entity_id,
      operation: item.operation,
      payload: JSON.parse(item.payload),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function runSyncCycle(): Promise<void> {
  if (!prefs.cloudSyncEnabled) return;

  const apiUrl = process.env.API_URL;
  if (!apiUrl) return;

  const items = await getPendingItems();
  for (const item of items) {
    try {
      await processItem(item, apiUrl);
      await markSuccess(item.id);
    } catch (err) {
      await markFailed(item.id, item.attempts, err instanceof Error ? err.message : String(err));
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
