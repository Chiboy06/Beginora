import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

// ── Tasks (Beginora core) ─────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id:          text("id").primaryKey(),
  title:       text("title").notNull(),
  firstAction: text("first_action"),           // AI-generated doable first step
  steps:       text("steps"),                  // JSON array of breakdown steps
  reminderId:  text("reminder_id"),
  status:      text("status", {
    enum: ["pending", "active", "done", "snoozed"],
  }).notNull().default("pending"),
  priority:    integer("priority").default(0),
  dueAt:       integer("due_at"),              // Unix ms
  completedAt: integer("completed_at"),
  createdAt:   integer("created_at").notNull(),
  updatedAt:   integer("updated_at").notNull(),
});

export const taskOutcomes = sqliteTable("task_outcomes", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  taskId:    text("task_id").notNull().references(() => tasks.id),
  outcome:   text("outcome", {
    enum: ["started", "completed", "snoozed", "wrong_moment", "stopped", "retried"],
  }).notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── Conversations & Messages ──────────────────────────────────────────────────

export const conversations = sqliteTable("conversations", {
  id:           text("id").primaryKey(),
  title:        text("title"),
  messageCount: integer("message_count").default(0),
  createdAt:    integer("created_at").notNull(),
  updatedAt:    integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id:             text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role:           text("role", { enum: ["user", "assistant", "tool_result"] }).notNull(),
  content:        text("content").notNull(),
  toolCall:       text("tool_call"),
  toolResult:     text("tool_result"),
  modelUsed:      text("model_used"),
  latencyMs:      integer("latency_ms"),
  createdAt:      integer("created_at").notNull(),
});

// ── Memories ─────────────────────────────────────────────────────────────────

export const memories = sqliteTable("memories", {
  id:              text("id").primaryKey(),
  category:        text("category", {
    enum: ["preference", "fact", "routine", "contact_note", "topic_interest"],
  }).notNull(),
  content:         text("content").notNull(),
  sourceMessageId: text("source_message_id"),
  confidence:      real("confidence").default(1.0),
  accessCount:     integer("access_count").default(0),
  createdAt:       integer("created_at").notNull(),
  lastAccessed:    integer("last_accessed").notNull(),
});

// ── Knowledge Files ───────────────────────────────────────────────────────────

export const knowledgeFiles = sqliteTable("knowledge_files", {
  id:        text("id").primaryKey(),
  filename:  text("filename").notNull(),
  fileSize:  integer("file_size").default(0),
  createdAt: integer("created_at").notNull(),
});

// ── Documents & Chunks (RAG) ──────────────────────────────────────────────────

export const documents = sqliteTable("documents", {
  id:         text("id").primaryKey(),
  filename:   text("filename").notNull(),
  mime:       text("mime"),
  sizeBytes:  integer("size_bytes").default(0),
  chunkCount: integer("chunk_count").default(0),
  createdAt:  integer("created_at").notNull(),
});

export const chunks = sqliteTable("chunks", {
  id:         text("id").primaryKey(),
  documentId: text("document_id").notNull().references(() => documents.id),
  ordinal:    integer("ordinal").notNull(),
  text:       text("text").notNull(),
  tokenCount: integer("token_count").default(0),
  embedding:  blob("embedding"),               // Float32Array as raw bytes
  createdAt:  integer("created_at").notNull(),
});

// ── Models ────────────────────────────────────────────────────────────────────

export const models = sqliteTable("models", {
  id:          text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  hfRepo:      text("hf_repo"),
  hfFile:      text("hf_file"),
  filePath:    text("file_path").notNull(),
  quant:       text("quant"),
  sizeBytes:   integer("size_bytes").default(0),
  minRamMb:    integer("min_ram_mb"),
  chatTemplate: text("chat_template"),
  contextSize: integer("context_size").default(4096),
  role:        text("role", { enum: ["primary", "router", "embedding"] }).notNull().default("primary"),
  state:       text("state", {
    enum: ["idle", "checking", "downloading", "paused", "verifying", "ready", "error", "canceled"],
  }).notNull().default("ready"),
  resumeToken: text("resume_token"),
  sha256:      text("sha256"),
  isActive:    integer("is_active").notNull().default(0),
  createdAt:   integer("created_at").notNull(),
});

// ── Config ────────────────────────────────────────────────────────────────────

export const config = sqliteTable("config", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Sync Queue (offline-first cloud sync) ─────────────────────────────────────

export const syncQueue = sqliteTable("sync_queue", {
  id:        text("id").primaryKey(),
  entity:    text("entity").notNull(),         // "task" | "task_step" | "message"
  entityId:  text("entity_id").notNull(),
  operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
  payload:   text("payload").notNull(),        // JSON
  attempts:  integer("attempts").default(0),
  lastError: text("last_error"),
  createdAt: integer("created_at").notNull(),
  nextRetry: integer("next_retry").notNull(),
});

// ── MCP Clients ───────────────────────────────────────────────────────────────

export const mcpClients = sqliteTable("mcp_clients", {
  id:        text("id").primaryKey(),
  name:      text("name").notNull(),
  token:     text("token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  lastSeen:  integer("last_seen"),
});
