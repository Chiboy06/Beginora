// End-to-end test of the relay against real databases: SQLite (as on
// Cloudflare D1) and Postgres via PGlite (as on Supabase), with Telegram's API
// stubbed. Run: npm run test:relay

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import worker from "../src/worker.js";
import { d1FromPostgres, toPg } from "../src/pg-adapter.js";

// The small part of Cloudflare D1's API the worker uses.
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { db.prepare(sql).run(...args); return { success: true }; },
      };
      return stmt;
    },
  };
}

const BACKENDS = {
  "SQLite (Cloudflare D1)": async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
    return d1(db);
  },
  "Postgres (Supabase)": async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync(new URL("../schema.postgres.sql", import.meta.url), "utf8"));
    return d1FromPostgres((text, params) => pg.query(text, params).then((r) => r.rows));
  },
};

test("placeholders become $1, $2 ... for Postgres", () => {
  assert.equal(toPg("SELECT * FROM t WHERE a = ? AND b >= ?"), "SELECT * FROM t WHERE a = $1 AND b >= $2");
});

let env;
let sent;

for (const [backend, makeDb] of Object.entries(BACKENDS)) describe(backend, () => {

beforeEach(async () => {
  env = { DB: await makeDb(), BOT_TOKEN: "123:secret-token", WEBHOOK_SECRET: "hook-secret", BOT_USERNAME: "BeginoraBot" };
  sent = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith("https://api.telegram.org/bot123:secret-token/"));
    sent.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
});

const call = (path, { method = "GET", auth, body, headers = {} } = {}) =>
  worker.fetch(new Request(`https://relay.example${path}`, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }), env);

const hook = (text, chatId = 555, type = "private") =>
  call("/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "hook-secret" }, body: { update_id: 1, message: { chat: { id: chatId, type }, from: { first_name: "Chi" }, text } } });

async function linkedDevice() {
  const linkRes = await (await call("/link", { method: "POST" })).json();
  await hook(`/start ${linkRes.code}`);
  return `${linkRes.deviceId}.${linkRes.secret}`;
}

test("connect with the deep link, then the phone sees it is linked", async () => {
  const res = await (await call("/link", { method: "POST" })).json();
  assert.match(res.deepLink, /^https:\/\/t\.me\/BeginoraBot\?start=[A-Za-z0-9_-]{1,64}$/);
  const auth = `${res.deviceId}.${res.secret}`;
  assert.deepEqual(await (await call("/status", { auth })).json(), { linked: false, name: "" });
  await hook(`/start ${res.code}`);
  assert.deepEqual(await (await call("/status", { auth })).json(), { linked: true, name: "Chi" });
  assert.match(sent.at(-1).body.text, /Connected to Beginora, Chi/);
});

test("the phone sends a message and the bot delivers it to the linked chat", async () => {
  const auth = await linkedDevice();
  const res = await call("/send", { method: "POST", auth, body: { text: "Reminder: call the dentist" } });
  assert.equal(res.status, 200);
  assert.deepEqual(sent.at(-1), { method: "sendMessage", body: { chat_id: "555", text: "Reminder: call the dentist" } });
});

test("messages to the bot wait in the inbox and are deleted once fetched", async () => {
  const auth = await linkedDevice();
  await hook("/add buy bread");
  await hook("/next");
  const first = await (await call("/inbox", { auth })).json();
  assert.deepEqual(first.messages.map((m) => m.text), ["/add buy bread", "/next"]);
  const second = await (await call("/inbox", { auth })).json();
  assert.deepEqual(second.messages, []);
});

test("a wrong secret, an unknown device or a fake webhook is refused", async () => {
  const auth = await linkedDevice();
  const [id] = auth.split(".");
  assert.equal((await call("/status", { auth: `${id}.wrongsecret` })).status, 401);
  assert.equal((await call("/status")).status, 401);
  const fake = await call("/webhook", { method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": "guess" }, body: {} });
  assert.equal(fake.status, 403);
});

test("an expired or unknown code does not link, and groups are ignored", async () => {
  const res = await (await call("/link", { method: "POST" })).json();
  await hook("/start notarealcode");
  await hook(`/start ${res.code}`, 777, "group");
  assert.deepEqual(await (await call("/status", { auth: `${res.deviceId}.${res.secret}` })).json(), { linked: false, name: "" });
});

test("/stop disconnects and removes waiting messages", async () => {
  const auth = await linkedDevice();
  await hook("hello");
  await hook("/stop");
  assert.equal((await call("/inbox", { auth })).status, 401);
  assert.match(sent.at(-1).body.text, /Disconnected/);
});

test("sending is limited per device each hour", async () => {
  const auth = await linkedDevice();
  for (let i = 0; i < 30; i++) assert.equal((await call("/send", { method: "POST", auth, body: { text: `m${i}` } })).status, 200);
  assert.equal((await call("/send", { method: "POST", auth, body: { text: "one too many" } })).status, 429);
});

test("connecting a second phone to the same chat replaces the first", async () => {
  const first = await linkedDevice();
  const second = await linkedDevice();
  assert.equal((await call("/status", { auth: first })).status, 401);
  assert.equal((await (await call("/status", { auth: second })).json()).linked, true);
});

});
