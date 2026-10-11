import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

export async function getDb() {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const sqlite = await SQLite.openDatabaseAsync("beginora.db");
    const db = drizzle(sqlite, { schema });

    // Seed default config on first open
    await sqlite.execAsync(`
      INSERT OR IGNORE INTO config (key, value) VALUES ('language', 'en');
      INSERT OR IGNORE INTO config (key, value) VALUES ('confirm_destructive_actions', 'true');
      INSERT OR IGNORE INTO config (key, value) VALUES ('cloud_sync_enabled', 'false');
    `);

    _db = db;
    return db;
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });

  return _initPromise;
}

export type Db = Awaited<ReturnType<typeof getDb>>;
