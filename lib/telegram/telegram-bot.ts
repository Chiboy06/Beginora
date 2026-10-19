// Two-way Telegram: long-polls the Bot API and answers only the saved chat.
// Pure apart from the injected fetch and storage, so the same code runs in the
// app, in Jest and in scripts/telegram-smoke.ts against a real bot.

export interface BotDeps {
  fetch: typeof fetch;
  token: string;
  // Only this chat is answered. Anyone can find a bot, so others are ignored.
  chatId: string;
  loadOffset(): Promise<number>;
  saveOffset(offset: number): Promise<void>;
  handle(text: string): Promise<string>;
}

interface TelegramUpdate {
  update_id: number;
  message?: { chat?: { id?: number | string }; text?: string };
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export class TelegramApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Long-poll wait in seconds; Telegram holds the request until a message arrives.
export const POLL_TIMEOUT_SECONDS = 50;
// Telegram rejects messages longer than 4096 characters.
const MAX_REPLY_CHARS = 4000;

async function call<T>(deps: BotDeps, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await deps.fetch(`https://api.telegram.org/bot${deps.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as TelegramResponse<T>;
  if (!res.ok || !data.ok) {
    throw new TelegramApiError(data.error_code ?? res.status, data.description ?? `Telegram error ${res.status}`);
  }
  return data.result as T;
}

export function sendText(deps: BotDeps, text: string): Promise<unknown> {
  // Plain text (no parse_mode) so task text can never inject markup.
  return call(deps, "sendMessage", { chat_id: deps.chatId, text: text.slice(0, MAX_REPLY_CHARS) });
}

// One long-poll round. Returns how many messages from the owner were answered.
export async function pollOnce(deps: BotDeps, timeoutSeconds = POLL_TIMEOUT_SECONDS): Promise<number> {
  let updates: TelegramUpdate[];
  try {
    updates = await call<TelegramUpdate[]>(deps, "getUpdates", {
      offset: await deps.loadOffset(),
      timeout: timeoutSeconds,
      allowed_updates: ["message"],
    });
  } catch (err) {
    // 409: a webhook is set (or another poller runs). Polling needs the webhook removed.
    if (err instanceof TelegramApiError && err.status === 409) {
      await call(deps, "deleteWebhook", { drop_pending_updates: false });
      return 0;
    }
    throw err;
  }

  let answered = 0;
  for (const update of updates) {
    // Confirm before handling: a crash mid-handle must not create the same task twice.
    await deps.saveOffset(update.update_id + 1);
    const text = update.message?.text?.trim();
    if (!text || String(update.message?.chat?.id) !== deps.chatId) continue;
    let reply: string;
    try {
      reply = await deps.handle(text);
    } catch {
      reply = "Something went wrong on the phone. Please try again in a moment.";
    }
    await sendText(deps, reply);
    answered += 1;
  }
  return answered;
}

// Exponential backoff for failed polls: 2s, 4s, 8s ... capped at 60s.
export function backoffMs(failures: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(1, failures));
}

export interface LoopControl {
  isRunning(): boolean;
  sleep(ms: number): Promise<void>;
}

export async function runBotLoop(deps: BotDeps, control: LoopControl): Promise<void> {
  let failures = 0;
  while (control.isRunning()) {
    try {
      await pollOnce(deps);
      failures = 0;
    } catch (err) {
      // 401/404: the token is wrong; retrying cannot fix it.
      if (err instanceof TelegramApiError && (err.status === 401 || err.status === 404)) throw err;
      failures += 1;
      await control.sleep(backoffMs(failures));
    }
  }
}
