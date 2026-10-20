-- Beginora Telegram relay (Cloudflare D1). Message text is kept only until
-- the phone fetches it, and never longer than 24 hours.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  chat_id TEXT,
  name TEXT,
  link_code TEXT UNIQUE,
  code_expires INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_chat ON devices(chat_id);

CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_device ON inbox(device_id, id);

CREATE TABLE IF NOT EXISTS sends (
  device_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sends_device ON sends(device_id, at);
