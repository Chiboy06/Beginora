// SQLite storage layer using expo-sqlite.
// Manages messages, conversations, memories, tasks, and config for Beginora.

import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";
import type { Message } from "../orchestrator/types";

export interface Conversation {
  id: string;
  title: string | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Memory {
  id: string;
  category: "preference" | "fact" | "routine" | "contact_note" | "topic_interest";
  content: string;
  sourceMessageId: string | null;
  confidence: number;
  accessCount: number;
  createdAt: number;
  lastAccessed: number;
}

export interface KnowledgeFile {
  id: string;
  filename: string;
  fileSize: number;
  createdAt: number;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  mime: string | null;
  sizeBytes: number;
  chunkCount: number;
  createdAt: number;
}

// A chunk with its embedding, as needed by the brute-force cosine retriever.
export interface StoredChunk {
  id: string;
  documentId: string;
  ordinal: number;
  text: string;
  embedding: Float32Array;
}

let db: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// --- Schema migrations ---
// The baseline tables above use CREATE TABLE IF NOT EXISTS (safe for fresh and
// existing installs). Any change to an EXISTING table (e.g. ADD COLUMN) must go
// through a numbered migration here so upgraded installs converge deterministically
// instead of silently missing columns. Bump SCHEMA_VERSION and append to MIGRATIONS.
// Exported for the migration-chain regression test (migrations.test.ts).
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        hf_repo TEXT,
        hf_file TEXT,
        file_path TEXT NOT NULL,
        quant TEXT,
        size_bytes INTEGER DEFAULT 0,
        min_ram_mb INTEGER,
        chat_template TEXT,
        context_size INTEGER DEFAULT 4096,
        role TEXT NOT NULL DEFAULT 'primary' CHECK(role IN ('primary','router','embedding')),
        state TEXT NOT NULL DEFAULT 'ready'
          CHECK(state IN ('idle','checking','downloading','paused','verifying','ready','error','canceled')),
        resume_token TEXT,
        sha256 TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active DESC);
    `,
  },
  {
    // Fase 3 (RAG): imported documents and their embedded chunks. Embeddings are
    // stored as raw float32 bytes in a BLOB; retrieval is a brute-force cosine
    // scan in TypeScript (no sqlite-vec — Expo's SQLite can't load extensions).
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime TEXT,
        size_bytes INTEGER DEFAULT 0,
        chunk_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER DEFAULT 0,
        embedding BLOB,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
    `,
  },
  {
    // Beginora core: tasks with AI-generated first actions.
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        first_action TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','active','done','snoozed')),
        priority INTEGER DEFAULT 0,
        due_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, created_at DESC);
    `,
  },
  {
    // MCP: per-client bearer tokens for the local MCP server.
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS mcp_clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_seen INTEGER
      );
    `,
  },
  {
    // Task-start prototype: persist validated follow-up steps, one local reminder,
    // and an auditable local-only outcome trail.
    version: 5,
    sql: `
      ALTER TABLE tasks ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE tasks ADD COLUMN reminder_id TEXT;

      CREATE TABLE IF NOT EXISTS task_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        outcome TEXT NOT NULL CHECK(outcome IN ('started','completed','snoozed','wrong_moment','stopped','retried')),
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_outcomes_task ON task_outcomes(task_id, created_at DESC);
    `,
  },
  {
    // Planner, mood journal and routines: task notes and repeat, daily mood and
    // journal entries, and the user's saved routines.
    version: 6,
    sql: `
      ALTER TABLE tasks ADD COLUMN notes TEXT;
      ALTER TABLE tasks ADD COLUMN repeat TEXT NOT NULL DEFAULT 'never';

      CREATE TABLE IF NOT EXISTS journal_entries (
        id TEXT PRIMARY KEY,
        mood TEXT,
        title TEXT,
        body TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_journal_created ON journal_entries(created_at DESC);

      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT,
        steps TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );
    `,
  },
];

// Exported for testing. Applies every migration whose version exceeds the DB's
// current user_version, in ascending order, each in its own transaction.
export async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    // Commit schema + version atomically so a crash can't leave a half-applied
    // migration that re-runs on next boot (safe only while migrations are
    // idempotent; future non-idempotent ones depend on this). PRAGMA cannot be
    // parameterized; m.version is a trusted integer literal.
    await database.withTransactionAsync(async () => {
      await database.execAsync(m.sql);
      await database.execAsync(`PRAGMA user_version = ${m.version}`);
    });
    current = m.version;
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const database = await SQLite.openDatabaseAsync("beginora.db");
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool_result')),
        content TEXT NOT NULL,
        tool_call TEXT,
        tool_result TEXT,
        model_used TEXT,
        latency_ms INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        message_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_updated
        ON conversations(updated_at DESC);

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN ('preference','fact','routine','contact_note','topic_interest')),
        content TEXT NOT NULL,
        source_message_id TEXT,
        confidence REAL DEFAULT 1.0,
        access_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memories_confidence
        ON memories(confidence DESC);

      CREATE TABLE IF NOT EXISTS knowledge_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')),
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        next_retry INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(next_retry ASC);

      INSERT OR IGNORE INTO config (key, value) VALUES ('language', 'en');
      INSERT OR IGNORE INTO config (key, value) VALUES ('confirm_destructive_actions', 'true');
      INSERT OR IGNORE INTO config (key, value) VALUES ('cloud_sync_enabled', 'false');
    `);
    await runMigrations(database);
    db = database;
    return database;
  })().catch((err) => {
    // Reset so future calls can retry instead of returning the rejected promise forever
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

// On-disk byte size of the database file, for the diagnostics screen.
// expo-sqlite stores databases under documentDirectory/SQLite/.
export async function getDatabaseSizeBytes(): Promise<number> {
  const path = `${FileSystem.documentDirectory}SQLite/beginora.db`;
  const info = await FileSystem.getInfoAsync(path);
  return info.exists ? info.size ?? 0 : 0;
}

// --- Messages ---

export async function saveMessage(message: Message): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `INSERT INTO messages (id, conversation_id, role, content, tool_call, tool_result, model_used, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    message.id,
    message.conversationId,
    message.role,
    message.content,
    message.toolCall ?? null,
    message.toolResult ?? null,
    message.modelUsed ?? null,
    message.latencyMs ?? null,
    message.createdAt,
  );
}

// Update a message's tool result after a deferred (confirmed/declined) action.
export async function updateMessageToolResult(
  id: string,
  toolResult: string,
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE messages SET tool_result = ? WHERE id = ?",
    toolResult,
    id,
  );
}

export async function getMessages(
  conversationId: string,
  limit = 50,
): Promise<Message[]> {
  const d = await getDatabase();
  // Newest `limit` messages, returned oldest-first for display.
  const rows = await d.getAllAsync<Message>(
    `SELECT * FROM (
       SELECT id, conversation_id AS conversationId, role, content, tool_call AS toolCall,
              tool_result AS toolResult, model_used AS modelUsed, latency_ms AS latencyMs,
              created_at AS createdAt
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?
     ) ORDER BY createdAt ASC`,
    conversationId,
    limit,
  );
  return rows;
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  const d = await getDatabase();
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      "DELETE FROM messages WHERE conversation_id = ?",
      conversationId,
    );
    await d.runAsync(
      "DELETE FROM conversations WHERE id = ?",
      conversationId,
    );
  });
}

// --- Config ---

export async function getConfig(key: string): Promise<string | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{ value: string }>(
    "SELECT value FROM config WHERE key = ?",
    key,
  );
  return row?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
    key,
    value,
  );
}

export async function deleteConfig(key: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync("DELETE FROM config WHERE key = ?", key);
}

// --- Conversations ---

export async function createConversation(id: string, title?: string): Promise<void> {
  const d = await getDatabase();
  const now = Date.now();
  await d.runAsync(
    `INSERT INTO conversations (id, title, message_count, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)`,
    id,
    title ?? null,
    now,
    now,
  );
}

export async function getLatestConversation(): Promise<Conversation | null> {
  const d = await getDatabase();
  const row = await d.getFirstAsync<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, title, message_count, created_at, updated_at
     FROM conversations
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllConversations(): Promise<Conversation[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT id, title, message_count, created_at, updated_at
     FROM conversations
     ORDER BY updated_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export interface ConversationWithPreview extends Conversation {
  preview: string | null;
}

export async function getAllConversationsWithPreview(): Promise<ConversationWithPreview[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    title: string | null;
    message_count: number;
    created_at: number;
    updated_at: number;
    preview: string | null;
  }>(
    `SELECT c.id, c.title, c.message_count, c.created_at, c.updated_at,
            (SELECT content FROM messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as preview
     FROM conversations c
     WHERE c.message_count > 0
     ORDER BY c.updated_at DESC
     LIMIT 100`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    messageCount: r.message_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    preview: r.preview,
  }));
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
    title,
    Date.now(),
    id,
  );
}

export async function touchConversation(id: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?",
    Date.now(),
    id,
  );
}

// --- Memories ---

export async function saveMemory(memory: {
  id: string;
  category: Memory["category"];
  content: string;
  sourceMessageId?: string;
  confidence?: number;
}): Promise<void> {
  const d = await getDatabase();
  const now = Date.now();
  await d.runAsync(
    `INSERT OR REPLACE INTO memories (id, category, content, source_message_id, confidence, access_count, created_at, last_accessed)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    memory.id,
    memory.category,
    memory.content,
    memory.sourceMessageId ?? null,
    memory.confidence ?? 1.0,
    now,
    now,
  );
}

export async function getAllMemories(): Promise<Memory[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    category: Memory["category"];
    content: string;
    source_message_id: string | null;
    confidence: number;
    access_count: number;
    created_at: number;
    last_accessed: number;
  }>(
    `SELECT id, category, content, source_message_id, confidence, access_count, created_at, last_accessed
     FROM memories
     WHERE confidence > 0.1
     ORDER BY confidence DESC, last_accessed DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    sourceMessageId: r.source_message_id,
    confidence: r.confidence,
    accessCount: r.access_count,
    createdAt: r.created_at,
    lastAccessed: r.last_accessed,
  }));
}

export async function getTopMemories(limit = 15): Promise<Memory[]> {
  const d = await getDatabase();
  const now = Date.now();
  const rows = await d.getAllAsync<{
    id: string;
    category: Memory["category"];
    content: string;
    source_message_id: string | null;
    confidence: number;
    access_count: number;
    created_at: number;
    last_accessed: number;
  }>(
    `SELECT id, category, content, source_message_id, confidence, access_count, created_at, last_accessed
     FROM memories
     WHERE confidence > 0.2
     ORDER BY (confidence * (1.0 + access_count * 0.1) * (1.0 / (1.0 + (? - last_accessed) / 2592000000.0))) DESC
     LIMIT ?`,
    now,
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    content: r.content,
    sourceMessageId: r.source_message_id,
    confidence: r.confidence,
    accessCount: r.access_count,
    createdAt: r.created_at,
    lastAccessed: r.last_accessed,
  }));
}

export async function bumpMemoryAccess(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  await d.runAsync(
    `UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id IN (${placeholders})`,
    Date.now(),
    ...ids,
  );
}

export async function findMemoryByContent(content: string): Promise<Memory | null> {
  const d = await getDatabase();
  // Simple substring search — enough for dedup
  const row = await d.getFirstAsync<{
    id: string;
    category: Memory["category"];
    content: string;
    source_message_id: string | null;
    confidence: number;
    access_count: number;
    created_at: number;
    last_accessed: number;
  }>(
    `SELECT id, category, content, source_message_id, confidence, access_count, created_at, last_accessed
     FROM memories
     WHERE content = ?
     LIMIT 1`,
    content,
  );
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    sourceMessageId: row.source_message_id,
    confidence: row.confidence,
    accessCount: row.access_count,
    createdAt: row.created_at,
    lastAccessed: row.last_accessed,
  };
}

export async function decayMemories(): Promise<void> {
  const d = await getDatabase();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  // Reduce confidence of memories not accessed in 30 days
  await d.runAsync(
    `UPDATE memories SET confidence = confidence * 0.9
     WHERE last_accessed < ? AND confidence > 0.1`,
    thirtyDaysAgo,
  );
  // Delete very low confidence memories
  await d.runAsync("DELETE FROM memories WHERE confidence <= 0.1");
}

export async function deleteMemory(id: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync("DELETE FROM memories WHERE id = ?", id);
}

// --- Knowledge Files ---

export async function saveKnowledgeFile(file: {
  id: string;
  filename: string;
  fileSize: number;
}): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `INSERT INTO knowledge_files (id, filename, file_size, created_at)
     VALUES (?, ?, ?, ?)`,
    file.id,
    file.filename,
    file.fileSize,
    Date.now(),
  );
}

export async function getKnowledgeFiles(): Promise<KnowledgeFile[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    filename: string;
    file_size: number;
    created_at: number;
  }>(
    `SELECT id, filename, file_size, created_at
     FROM knowledge_files
     ORDER BY created_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    fileSize: r.file_size,
    createdAt: r.created_at,
  }));
}

export async function deleteKnowledgeFile(id: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync("DELETE FROM knowledge_files WHERE id = ?", id);
}

// --- Documents & chunks (RAG) ---

// Embeddings persist as raw little-endian float32 bytes in a BLOB column. These
// helpers copy through fresh buffers so a Float32Array view is always valid,
// regardless of the source array's byteOffset/alignment.
function f32ToBytes(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength).slice();
}

function bytesToF32(bytes: Uint8Array): Float32Array {
  const copy = bytes.slice(); // fresh, 0-offset buffer → safe Float32Array view
  return new Float32Array(copy.buffer, 0, Math.floor(copy.byteLength / 4));
}

export async function saveDocument(doc: {
  id: string;
  filename: string;
  mime?: string | null;
  sizeBytes: number;
  chunkCount: number;
}): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `INSERT OR REPLACE INTO documents (id, filename, mime, size_bytes, chunk_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    doc.id,
    doc.filename,
    doc.mime ?? null,
    doc.sizeBytes,
    doc.chunkCount,
    Date.now(),
  );
}

export async function saveChunks(
  chunks: {
    id: string;
    documentId: string;
    ordinal: number;
    text: string;
    tokenCount: number;
    embedding: Float32Array;
  }[],
): Promise<void> {
  if (chunks.length === 0) return;
  const d = await getDatabase();
  const now = Date.now();
  await d.withTransactionAsync(async () => {
    for (const c of chunks) {
      await d.runAsync(
        `INSERT OR REPLACE INTO chunks (id, document_id, ordinal, text, token_count, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.documentId,
        c.ordinal,
        c.text,
        c.tokenCount,
        f32ToBytes(c.embedding),
        now,
      );
    }
  });
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    filename: string;
    mime: string | null;
    size_bytes: number;
    chunk_count: number;
    created_at: number;
  }>(
    `SELECT id, filename, mime, size_bytes, chunk_count, created_at
     FROM documents ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    chunkCount: r.chunk_count,
    createdAt: r.created_at,
  }));
}

// Deletes a document and its chunks atomically.
export async function deleteDocument(id: string): Promise<void> {
  const d = await getDatabase();
  await d.withTransactionAsync(async () => {
    await d.runAsync("DELETE FROM chunks WHERE document_id = ?", id);
    await d.runAsync("DELETE FROM documents WHERE id = ?", id);
  });
}

// Loads every embedded chunk for the brute-force cosine retriever. Personal-scale
// corpora (dozens of docs, a few thousand chunks) fit comfortably in memory.
export async function getAllChunks(): Promise<StoredChunk[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: string;
    document_id: string;
    ordinal: number;
    text: string;
    embedding: Uint8Array | null;
  }>(`SELECT id, document_id, ordinal, text, embedding FROM chunks`);
  const out: StoredChunk[] = [];
  for (const r of rows) {
    if (!r.embedding) continue;
    out.push({
      id: r.id,
      documentId: r.document_id,
      ordinal: r.ordinal,
      text: r.text,
      embedding: bytesToF32(r.embedding),
    });
  }
  return out;
}

// --- MCP clients (Fase 6) ---

export interface McpClientRow {
  id: string;
  name: string;
  token: string;
  created_at: number;
  last_seen: number | null;
}

export async function insertMcpClient(row: McpClientRow): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO mcp_clients (id, name, token, created_at, last_seen) VALUES (?, ?, ?, ?, ?)",
    [row.id, row.name, row.token, row.created_at, row.last_seen],
  );
}

export async function selectMcpClients(): Promise<McpClientRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<McpClientRow>(
    "SELECT id, name, token, created_at, last_seen FROM mcp_clients ORDER BY created_at DESC",
  );
}

export async function deleteMcpClient(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM mcp_clients WHERE id = ?", [id]);
}

export async function deleteAllMcpClients(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM mcp_clients");
}

export async function touchMcpClient(token: string, at: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE mcp_clients SET last_seen = ? WHERE token = ?", [at, token]);
}

// --- Tasks (Beginora core) ---

export interface Task {
  id: string;
  title: string;
  firstAction: string | null;
  steps: string[];
  reminderId: string | null;
  status: "pending" | "active" | "done" | "snoozed";
  priority: number;
  dueAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
  notes?: string | null;
  repeat?: Repeat;
}

export type Repeat = "never" | "daily" | "weekdays" | "weekly";

async function insertTaskRow(d: SQLite.SQLiteDatabase, task: Task): Promise<void> {
  await d.runAsync(
    `INSERT OR REPLACE INTO tasks
       (id, title, first_action, steps, reminder_id, status, priority, due_at, completed_at, created_at, updated_at, notes, repeat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    task.id, task.title, task.firstAction ?? null, JSON.stringify(task.steps), task.reminderId,
    task.status,
    task.priority, task.dueAt ?? null, task.completedAt ?? null,
    task.createdAt, task.updatedAt, task.notes ?? null, task.repeat ?? "never",
  );
}

export async function saveTask(task: Task): Promise<void> {
  const d = await getDatabase();
  await insertTaskRow(d, task);
}

export async function saveTaskWithPlan(
  task: Task,
  firstAction: string,
  steps: string[],
): Promise<void> {
  const d = await getDatabase();
  const unplannedTask: Task = { ...task, firstAction: null, steps: [] };
  await d.withTransactionAsync(async () => {
    await insertTaskRow(d, unplannedTask);
    await d.runAsync(
      "UPDATE tasks SET first_action = ?, steps = ?, updated_at = ? WHERE id = ?",
      firstAction,
      JSON.stringify(steps),
      task.updatedAt,
      task.id,
    );
  });
}

function parseTaskSteps(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export async function getTasks(status?: Task["status"]): Promise<Task[]> {
  const d = await getDatabase();
  const rows = status
    ? await d.getAllAsync<any>(
        `SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, created_at DESC`,
        status,
      )
    : await d.getAllAsync<any>(
        `SELECT * FROM tasks ORDER BY priority DESC, created_at DESC`,
      );
  return rows.map((r) => ({
    id: r.id, title: r.title, firstAction: r.first_action,
    steps: parseTaskSteps(r.steps), reminderId: r.reminder_id ?? null,
    status: r.status, priority: r.priority, dueAt: r.due_at,
    completedAt: r.completed_at, createdAt: r.created_at, updatedAt: r.updated_at,
    notes: r.notes ?? null, repeat: (r.repeat ?? "never") as Repeat,
  }));
}

export async function updateTaskStatus(
  id: string,
  status: Task["status"],
  updatedAt = Date.now(),
): Promise<void> {
  const d = await getDatabase();
  const completedAt = status === "done" ? updatedAt : null;
  await d.runAsync(
    `UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
    status, completedAt, updatedAt, id,
  );
}

export async function updateTaskFirstAction(
  id: string,
  firstAction: string,
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    `UPDATE tasks SET first_action = ?, updated_at = ? WHERE id = ?`,
    firstAction, Date.now(), id,
  );
}

export async function updateTaskPlan(
  id: string,
  firstAction: string,
  steps: string[],
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE tasks SET first_action = ?, steps = ?, updated_at = ? WHERE id = ?",
    firstAction,
    JSON.stringify(steps),
    Date.now(),
    id,
  );
}

export async function updateTaskReminderId(
  id: string,
  reminderId: string | null,
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE tasks SET reminder_id = ?, updated_at = ? WHERE id = ?",
    reminderId,
    Date.now(),
    id,
  );
}

export type TaskOutcome =
  | "started"
  | "completed"
  | "snoozed"
  | "wrong_moment"
  | "stopped"
  | "retried";

export interface TaskOutcomeRecord {
  id: number;
  taskId: string;
  outcome: TaskOutcome;
  createdAt: number;
}

export async function recordTaskOutcome(
  taskId: string,
  outcome: TaskOutcome,
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "INSERT INTO task_outcomes (task_id, outcome, created_at) VALUES (?, ?, ?)",
    taskId,
    outcome,
    Date.now(),
  );
}

export async function updateTaskStatusAndRecordOutcome(
  id: string,
  status: Task["status"],
  outcome: TaskOutcome,
  updatedAt = Date.now(),
): Promise<void> {
  const d = await getDatabase();
  const completedAt = status === "done" ? updatedAt : null;
  await d.withTransactionAsync(async () => {
    await d.runAsync(
      "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
      status,
      completedAt,
      updatedAt,
      id,
    );
    await d.runAsync(
      "INSERT INTO task_outcomes (task_id, outcome, created_at) VALUES (?, ?, ?)",
      id,
      outcome,
      updatedAt,
    );
  });
}

export async function getTaskOutcomes(taskId: string, limit = 10): Promise<TaskOutcomeRecord[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<{
    id: number;
    task_id: string;
    outcome: TaskOutcome;
    created_at: number;
  }>(
    "SELECT id, task_id, outcome, created_at FROM task_outcomes WHERE task_id = ? ORDER BY created_at DESC LIMIT ?",
    taskId,
    limit,
  );
  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    outcome: row.outcome,
    createdAt: row.created_at,
  }));
}

export async function deleteTask(id: string): Promise<void> {
  const d = await getDatabase();
  await d.withTransactionAsync(async () => {
    await d.runAsync("DELETE FROM task_outcomes WHERE task_id = ?", id);
    await d.runAsync("DELETE FROM tasks WHERE id = ?", id);
  });
}

// Title, notes, time and repeat edited together from the task form.
export async function updateTaskDetails(
  id: string,
  fields: { title: string; notes: string | null; dueAt: number | null; repeat: Repeat; steps: string[] },
): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE tasks SET title = ?, notes = ?, due_at = ?, repeat = ?, steps = ?, updated_at = ? WHERE id = ?",
    fields.title, fields.notes, fields.dueAt, fields.repeat, JSON.stringify(fields.steps), Date.now(), id,
  );
}

// A repeating task moves to its next time instead of staying done.
export async function rollTaskForward(id: string, dueAt: number): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "UPDATE tasks SET status = 'pending', completed_at = NULL, due_at = ?, updated_at = ? WHERE id = ?",
    dueAt, Date.now(), id,
  );
}

// --- Mood and journal ---

export interface JournalEntry {
  id: string;
  mood: string | null;
  title: string | null;
  body: string | null;
  tags: string[];
  createdAt: number;
}

export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "INSERT OR REPLACE INTO journal_entries (id, mood, title, body, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    entry.id, entry.mood, entry.title, entry.body, JSON.stringify(entry.tags), entry.createdAt,
  );
}

export async function getJournalEntries(sinceMs = 0): Promise<JournalEntry[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<any>(
    "SELECT * FROM journal_entries WHERE created_at >= ? ORDER BY created_at DESC",
    sinceMs,
  );
  return rows.map((r) => ({
    id: r.id, mood: r.mood ?? null, title: r.title ?? null, body: r.body ?? null,
    tags: parseTaskSteps(r.tags), createdAt: r.created_at,
  }));
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync("DELETE FROM journal_entries WHERE id = ?", id);
}

// --- Routines ---

export interface RoutineStep {
  title: string;
  minutes: number;
}

export interface Routine {
  id: string;
  name: string;
  emoji: string | null;
  steps: RoutineStep[];
  createdAt: number;
}

export async function saveRoutine(routine: Routine): Promise<void> {
  const d = await getDatabase();
  await d.runAsync(
    "INSERT OR REPLACE INTO routines (id, name, emoji, steps, created_at) VALUES (?, ?, ?, ?, ?)",
    routine.id, routine.name, routine.emoji, JSON.stringify(routine.steps), routine.createdAt,
  );
}

export async function getRoutines(): Promise<Routine[]> {
  const d = await getDatabase();
  const rows = await d.getAllAsync<any>("SELECT * FROM routines ORDER BY created_at ASC");
  return rows.map((r) => {
    let steps: RoutineStep[] = [];
    try {
      const parsed = JSON.parse(r.steps);
      if (Array.isArray(parsed)) {
        steps = parsed.filter((x) => x && typeof x.title === "string").map((x) => ({ title: x.title, minutes: Number(x.minutes) || 5 }));
      }
    } catch {}
    return { id: r.id, name: r.name, emoji: r.emoji ?? null, steps, createdAt: r.created_at };
  });
}

export async function deleteRoutine(id: string): Promise<void> {
  const d = await getDatabase();
  await d.runAsync("DELETE FROM routines WHERE id = ?", id);
}
