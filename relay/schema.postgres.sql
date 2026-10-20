-- Beginora Telegram relay on Postgres (Supabase). Same tables as schema.sql;
-- times are BIGINT because Date.now() does not fit in a 32-bit INTEGER.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  chat_id TEXT,
  name TEXT,
  link_code TEXT UNIQUE,
  code_expires BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_chat ON devices(chat_id);

CREATE TABLE IF NOT EXISTS inbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  device_id TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_device ON inbox(device_id, id);

CREATE TABLE IF NOT EXISTS sends (
  device_id TEXT NOT NULL,
  at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sends_device ON sends(device_id, at);

-- The relay connects with the database URL Supabase gives Edge Functions.
-- No one else needs these tables: keep them out of the public API.
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sends ENABLE ROW LEVEL SECURITY;
