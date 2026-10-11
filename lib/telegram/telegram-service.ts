// Telegram integration — sends messages via the Telegram Bot API.
// The user's bot token is stored with the platform SecureStore; the chat ID and
// enabled flag remain in local SQLite. Sends are user-triggered, never silent.

import * as SecureStore from "expo-secure-store";
import { deleteConfig, getConfig, setConfig } from "../storage/database";

const KEY_TOKEN = "telegram_bot_token";
const KEY_CHAT_ID = "telegram_chat_id";
const KEY_ENABLED = "telegram_enabled";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

async function readSecureToken(): Promise<string> {
  try {
    const token = await SecureStore.getItemAsync(KEY_TOKEN);
    if (token) return token;
  } catch {
    // A platform SecureStore error must not fall back to sending with plaintext.
  }

  const legacyToken = await getConfig(KEY_TOKEN).catch(() => null);
  if (!legacyToken) return "";
  try {
    await SecureStore.setItemAsync(KEY_TOKEN, legacyToken);
    await deleteConfig(KEY_TOKEN);
    return legacyToken;
  } catch {
    // Preserve the old row for a later migration retry, but don't expose or use it.
    return "";
  }
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const [botToken, chatId, enabled] = await Promise.all([
    readSecureToken(),
    getConfig(KEY_CHAT_ID),
    getConfig(KEY_ENABLED),
  ]);
  return {
    botToken,
    chatId: chatId ?? "",
    enabled: enabled === "true",
  };
}

export async function saveTelegramConfig(cfg: TelegramConfig): Promise<void> {
  const botToken = cfg.botToken.trim();
  if (botToken) await SecureStore.setItemAsync(KEY_TOKEN, botToken);
  else await SecureStore.deleteItemAsync(KEY_TOKEN);

  await Promise.all([
    setConfig(KEY_CHAT_ID, cfg.chatId.trim()),
    setConfig(KEY_ENABLED, cfg.enabled ? "true" : "false"),
    deleteConfig(KEY_TOKEN),
  ]);
}

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const cfg = await getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) {
    return { ok: false, error: "Telegram is not configured." };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "HTML" }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.description ?? `Telegram API error (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach Telegram. Check your connection and try again." };
  }
}

export async function sendTaskSummary(taskTitle: string, firstAction: string | null): Promise<TelegramSendResult> {
  const lines = [
    `<b>Task:</b> ${escapeHtml(taskTitle)}`,
    firstAction ? `<b>First step:</b> ${escapeHtml(firstAction)}` : null,
    `<i>Sent from Beginora</i>`,
  ].filter(Boolean);
  return sendTelegramMessage(lines.join("\n"));
}

export async function sendTelegramReminder(taskTitle: string, firstAction: string | null): Promise<TelegramSendResult> {
  const step = firstAction ? `\nFirst step: ${escapeHtml(firstAction)}` : "";
  return sendTelegramMessage(`Beginora reminder: <b>${escapeHtml(taskTitle)}</b>${step}`);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
