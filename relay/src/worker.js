// Beginora Telegram relay: lets every user talk to ONE shared bot without
// creating their own. The bot token lives only here, as a Worker secret.
//
// Phone  -> POST /link             new device + one-time code (10 min)
// User   -> t.me/<bot>?start=<code> Telegram sends "/start <code>" to /webhook
// Phone  -> GET  /status           linked yet?
// Phone  -> POST /send {text}      bot messages the user
// Phone  -> GET  /inbox            messages the user sent the bot (then deleted)
// Phone  -> POST /unlink           forget this device
//
// Env: DB (D1), BOT_TOKEN (secret), WEBHOOK_SECRET (secret), BOT_USERNAME.

const CODE_TTL_MS = 10 * 60 * 1000;
const INBOX_TTL_MS = 24 * 60 * 60 * 1000;
const UNLINKED_TTL_MS = 24 * 60 * 60 * 1000;
const SENDS_PER_HOUR = 30;
const MAX_TEXT = 4000;
const MAX_INBOX = 100;

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// "Bearer <deviceId>.<secret>" -> the device row, or null.
async function authDevice(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(request.headers.get("Authorization") ?? "");
  if (!m) return null;
  const device = await env.DB.prepare("SELECT * FROM devices WHERE id = ?").bind(m[1]).first();
  if (!device || device.secret_hash !== (await sha256(m[2]))) return null;
  return device;
}

export async function telegram(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok === true, description: data.description };
}

async function link(env) {
  const now = Date.now();
  // Housekeeping: devices that never finished linking.
  await env.DB.prepare("DELETE FROM devices WHERE chat_id IS NULL AND created_at < ?").bind(now - UNLINKED_TTL_MS).run();
  const id = randomToken(12);
  const secret = randomToken(24);
  const code = randomToken(24);
  await env.DB.prepare(
    "INSERT INTO devices (id, secret_hash, link_code, code_expires, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, await sha256(secret), code, now + CODE_TTL_MS, now).run();
  return json({ deviceId: id, secret, code, deepLink: `https://t.me/${env.BOT_USERNAME}?start=${code}` });
}

async function send(request, env, device) {
  if (!device.chat_id) return json({ error: "Not connected to Telegram yet." }, 409);
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.slice(0, MAX_TEXT) : "";
  if (!text.trim()) return json({ error: "Nothing to send." }, 400);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM sends WHERE at < ?").bind(now - 60 * 60 * 1000).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM sends WHERE device_id = ?").bind(device.id).first();
  if ((count?.n ?? 0) >= SENDS_PER_HOUR) return json({ error: "Too many messages this hour. Try again later." }, 429);
  const result = await telegram(env, "sendMessage", {
    chat_id: device.chat_id,
    text,
    ...(body.html === true ? { parse_mode: "HTML" } : {}),
  });
  if (!result.ok) return json({ error: result.description ?? "Telegram did not accept the message." }, 502);
  await env.DB.prepare("INSERT INTO sends (device_id, at) VALUES (?, ?)").bind(device.id, now).run();
  return json({ ok: true });
}

async function inbox(env, device) {
  const rows = (await env.DB.prepare("SELECT id, text, received_at FROM inbox WHERE device_id = ? ORDER BY id LIMIT 50").bind(device.id).all()).results ?? [];
  if (rows.length) {
    await env.DB.prepare("DELETE FROM inbox WHERE device_id = ? AND id <= ?").bind(device.id, rows[rows.length - 1].id).run();
  }
  return json({ messages: rows.map((r) => ({ text: r.text, receivedAt: r.received_at })) });
}

async function unlinkDevice(env, deviceId) {
  await env.DB.prepare("DELETE FROM inbox WHERE device_id = ?").bind(deviceId).run();
  await env.DB.prepare("DELETE FROM sends WHERE device_id = ?").bind(deviceId).run();
  await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(deviceId).run();
}

async function webhook(request, env) {
  // Only Telegram knows this secret (set with setWebhook secret_token).
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  const update = await request.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  const text = typeof msg?.text === "string" ? msg.text.trim() : "";
  // Only private chats; groups and channels are ignored.
  if (!chatId || msg.chat.type !== "private" || !text) return json({ ok: true });
  const now = Date.now();
  await env.DB.prepare("DELETE FROM inbox WHERE received_at < ?").bind(now - INBOX_TTL_MS).run();

  const start = /^\/start(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(text);
  if (start) {
    const code = start[1];
    const device = code
      ? await env.DB.prepare("SELECT * FROM devices WHERE link_code = ? AND code_expires >= ?").bind(code, now).first()
      : null;
    if (!device) {
      await telegram(env, "sendMessage", { chat_id: chatId, text: "Hi! To connect, open Beginora on your phone: Settings > Telegram > Connect. The link there works for 10 minutes." });
      return json({ ok: true });
    }
    // One phone per Telegram chat: an older link for this chat is replaced.
    const old = (await env.DB.prepare("SELECT id FROM devices WHERE chat_id = ? AND id != ?").bind(chatId, device.id).all()).results ?? [];
    for (const o of old) await unlinkDevice(env, o.id);
    const name = String(msg.from?.first_name ?? "").slice(0, 64);
    await env.DB.prepare("UPDATE devices SET chat_id = ?, name = ?, link_code = NULL, code_expires = NULL WHERE id = ?").bind(chatId, name, device.id).run();
    await telegram(env, "sendMessage", { chat_id: chatId, text: `Connected to Beginora${name ? `, ${name}` : ""}. Reminders and summaries you send from the app arrive here. Reply any time: /next, /add <task>, /stuck, /done. Send /stop to disconnect.` });
    return json({ ok: true });
  }

  const device = await env.DB.prepare("SELECT id FROM devices WHERE chat_id = ?").bind(chatId).first();
  if (!device) {
    await telegram(env, "sendMessage", { chat_id: chatId, text: "This chat isn't connected yet. Open Beginora: Settings > Telegram > Connect." });
    return json({ ok: true });
  }
  if (text === "/stop") {
    await unlinkDevice(env, device.id);
    await telegram(env, "sendMessage", { chat_id: chatId, text: "Disconnected. Your messages are deleted from the relay. Connect again from the app any time." });
    return json({ ok: true });
  }
  const queued = await env.DB.prepare("SELECT COUNT(*) AS n FROM inbox WHERE device_id = ?").bind(device.id).first();
  if ((queued?.n ?? 0) >= MAX_INBOX) {
    await telegram(env, "sendMessage", { chat_id: chatId, text: "Your phone hasn't picked up messages for a while. Open Beginora to catch up." });
    return json({ ok: true });
  }
  await env.DB.prepare("INSERT INTO inbox (device_id, text, received_at) VALUES (?, ?, ?)").bind(device.id, text.slice(0, MAX_TEXT), now).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (request.method === "POST" && pathname === "/webhook") return await webhook(request, env);
      if (request.method === "POST" && pathname === "/link") return await link(env);
      const device = await authDevice(request, env);
      if (!device) return json({ error: "Unknown device." }, 401);
      if (request.method === "GET" && pathname === "/status") return json({ linked: !!device.chat_id, name: device.name ?? "" });
      if (request.method === "POST" && pathname === "/send") return await send(request, env, device);
      if (request.method === "GET" && pathname === "/inbox") return await inbox(env, device);
      if (request.method === "POST" && pathname === "/unlink") {
        await unlinkDevice(env, device.id);
        return json({ ok: true });
      }
      return json({ error: "Not found." }, 404);
    } catch (err) {
      // Never echo internals (or the token) back to callers.
      console.error("relay error", err && err.message);
      return json({ error: "Relay error." }, 500);
    }
  },
};
