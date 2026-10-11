import { v4 as uuid } from "uuid";
import { getDatabase } from "../storage/database";

export type SyncOperation = "upsert" | "delete";
export type SyncEntity = "task" | "task_step" | "message";

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  entityId: string;
  operation: SyncOperation;
  payload: string;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  nextRetry: number;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 5_000; // 5s, 10s, 20s, 40s, 80s

export async function enqueue(
  entity: SyncEntity,
  entityId: string,
  operation: SyncOperation,
  payload: object,
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue
       (id, entity, entity_id, operation, payload, attempts, last_error, created_at, next_retry)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    uuid(), entity, entityId, operation, JSON.stringify(payload), now, now,
  );
}

export async function getPendingItems(limit = 20): Promise<SyncQueueItem[]> {
  const db = await getDatabase();
  const now = Date.now();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_queue
     WHERE attempts < ? AND next_retry <= ?
     ORDER BY created_at ASC LIMIT ?`,
    MAX_ATTEMPTS, now, limit,
  );
  return rows.map((r) => ({
    id: r.id, entity: r.entity, entityId: r.entity_id,
    operation: r.operation, payload: r.payload,
    attempts: r.attempts, lastError: r.last_error,
    createdAt: r.created_at, nextRetry: r.next_retry,
  }));
}

export async function markSuccess(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue WHERE id = ?", id);
}

export async function markFailed(id: string, error: string, attempts: number): Promise<void> {
  const db = await getDatabase();
  const backoffMs = BACKOFF_BASE_MS * Math.pow(2, attempts);
  await db.runAsync(
    `UPDATE sync_queue SET attempts = ?, last_error = ?, next_retry = ? WHERE id = ?`,
    attempts + 1, error, Date.now() + backoffMs, id,
  );
}

export async function clearQueue(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM sync_queue");
}
