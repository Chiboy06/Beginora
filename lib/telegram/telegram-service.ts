// Telegram integration — sends messages via the Telegram Bot API.
// The user provides their own bot token and chat ID in Settings.
// Beginora never reads messages, never monitors the chat, never sends silently.
// All sends are user-triggered or triggered by a reminder the user explicitly set.

import { getConfig, setConfig } from "../storage/database";

const KEY_TOKEN = "telegram_bot_token";
const KEY_CHAT_ID = "telegram_chat_id";
const KEY_ENABLED = "telegram_enabled";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const [token, chatId, enabled] = await Promise.all([
    getConfig(KEY_TOKEN),
    getConfig(KEY_CHAT_ID),
    getConfig(KEY_ENABLED),
  ]);
  return {
    botToken: token ?? "",
    chatId: chatId ?? "",
    enabled: enabled === "true",
  };
}

export async function saveTelegramConfig(cfg: TelegramConfig): Promise<void> {
  await Promise.all([
    setConfig(KEY_TOKEN, cfg.botToken.trim()),
    setConfig(KEY_CHAT_ID, cfg.chatId.trim()),
    setConfig(KEY_ENABLED, cfg.enabled ? "true" : "false"),
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
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text,
          parse_mode: "HTML",
        }),
      },
    );
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? "Telegram API error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

// Convenience: send a task summary (called from task detail when user taps "Send to Telegram").
export async function sendTaskSummary(
  taskTitle: string,
  firstAction: string | null,
): Promise<TelegramSendResult> {
  const lines = [
    `<b>Task:</b> ${escapeHtml(taskTitle)}`,
    firstAction ? `<b>First step:</b> ${escapeHtml(firstAction)}` : null,
    `<i>Sent from Beginora</i>`,
  ].filter(Boolean);
  return sendTelegramMessage(lines.join("\n"));
}

// Convenience: send a reminder nudge (called when a task reminder fires and Telegram is on).
export async function sendTelegramReminder(
  taskTitle: string,
  firstAction: string | null,
): Promise<TelegramSendResult> {
  const step = firstAction ? `\nFirst step: ${escapeHtml(firstAction)}` : "";
  return sendTelegramMessage(
    `Beginora reminder: <b>${escapeHtml(taskTitle)}</b>${step}`,
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
