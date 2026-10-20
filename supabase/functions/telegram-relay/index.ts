// Supabase Edge Function (Deno) for the Beginora Telegram relay. Same code
// as the Cloudflare Worker (relay/src/worker.js), with Postgres instead of D1.
// Deploy: see docs/TELEGRAM_RELAY_GUIDE.md, "Supabase".

import postgres from "npm:postgres@3.4.5";
import worker from "../../../relay/src/worker.js";
import { d1FromPostgres } from "../../../relay/src/pg-adapter.js";

// SUPABASE_DB_URL is provided to every Edge Function by Supabase.
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3 });

const env = {
  DB: d1FromPostgres((text: string, params: unknown[]) => sql.unsafe(text, params as never[])),
  BOT_TOKEN: Deno.env.get("BOT_TOKEN"),
  WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET"),
  BOT_USERNAME: Deno.env.get("BOT_USERNAME"),
};

Deno.serve((request: Request) => {
  // Supabase serves this function under /telegram-relay/...; the relay expects /webhook, /link ...
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/telegram-relay/, "") || "/";
  return worker.fetch(new Request(url, request), env);
});
