import { backoffMs, pollOnce, runBotLoop, TelegramApiError, type BotDeps } from "../telegram-bot";

type Reply = { status?: number; body: unknown };

// Fake Telegram server: answers queued responses per method and records calls.
function fakeTelegram(responses: Record<string, Reply[]>) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fetchFn = jest.fn(async (url: string, init?: { body?: string }) => {
    const method = url.split("/").pop() as string;
    const body = JSON.parse(init?.body ?? "{}");
    calls.push({ method, body });
    const reply = responses[method]?.shift() ?? { body: { ok: true, result: [] } };
    return { ok: (reply.status ?? 200) < 400, status: reply.status ?? 200, json: async () => reply.body };
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

function deps(
  fetchFn: typeof fetch,
  handle: (text: string) => Promise<string> = jest.fn(async (t: string) => `echo ${t}`),
) {
  let offset = 0;
  const d: BotDeps = {
    fetch: fetchFn,
    token: "TEST",
    chatId: "42",
    loadOffset: async () => offset,
    saveOffset: async (n) => { offset = n; },
    handle,
  };
  return { d, handle, offset: () => offset };
}

const update = (id: number, chatId: number, text: string) => ({ update_id: id, message: { chat: { id: chatId }, text } });

test("answers the owner, ignores other chats, and confirms every update", async () => {
  const { fetchFn, calls } = fakeTelegram({
    getUpdates: [{ body: { ok: true, result: [update(10, 42, "/next"), update(11, 99, "hi from a stranger")] } }],
  });
  const { d, handle, offset } = deps(fetchFn);

  expect(await pollOnce(d, 0)).toBe(1);
  expect(handle).toHaveBeenCalledTimes(1);
  expect(handle).toHaveBeenCalledWith("/next");
  const sends = calls.filter((c) => c.method === "sendMessage");
  expect(sends).toEqual([{ method: "sendMessage", body: { chat_id: "42", text: "echo /next" } }]);
  expect(offset()).toBe(12);
});

test("sends the stored offset and long-poll timeout", async () => {
  const { fetchFn, calls } = fakeTelegram({});
  const { d } = deps(fetchFn);
  await d.saveOffset(7);
  await pollOnce(d, 50);
  expect(calls[0]).toEqual({ method: "getUpdates", body: { offset: 7, timeout: 50, allowed_updates: ["message"] } });
});

test("a 409 conflict removes the webhook instead of failing", async () => {
  const { fetchFn, calls } = fakeTelegram({
    getUpdates: [{ status: 409, body: { ok: false, error_code: 409, description: "Conflict: webhook is active" } }],
  });
  const { d } = deps(fetchFn);
  expect(await pollOnce(d, 0)).toBe(0);
  expect(calls.map((c) => c.method)).toEqual(["getUpdates", "deleteWebhook"]);
});

test("a handler error still replies and keeps polling", async () => {
  const { fetchFn, calls } = fakeTelegram({ getUpdates: [{ body: { ok: true, result: [update(1, 42, "plan")] } }] });
  const { d } = deps(fetchFn, jest.fn(async () => { throw new Error("db locked"); }));
  expect(await pollOnce(d, 0)).toBe(1);
  expect(calls.find((c) => c.method === "sendMessage")?.body.text).toMatch(/try again/);
});

test("long replies are cut to Telegram's limit", async () => {
  const { fetchFn, calls } = fakeTelegram({ getUpdates: [{ body: { ok: true, result: [update(1, 42, "x")] } }] });
  const { d } = deps(fetchFn, jest.fn(async () => "a".repeat(5000)));
  await pollOnce(d, 0);
  expect((calls.find((c) => c.method === "sendMessage")?.body.text as string).length).toBe(4000);
});

test("backoff grows and is capped at 60 seconds", () => {
  expect(backoffMs(1)).toBe(2000);
  expect(backoffMs(3)).toBe(8000);
  expect(backoffMs(20)).toBe(60_000);
});

test("the loop backs off on network errors and stops on a bad token", async () => {
  const { fetchFn } = fakeTelegram({
    getUpdates: [
      { status: 502, body: { ok: false, error_code: 502, description: "Bad Gateway" } },
      { status: 401, body: { ok: false, error_code: 401, description: "Unauthorized" } },
    ],
  });
  const { d } = deps(fetchFn);
  const sleep = jest.fn(async () => {});
  await expect(runBotLoop(d, { isRunning: () => true, sleep })).rejects.toBeInstanceOf(TelegramApiError);
  expect(sleep).toHaveBeenCalledWith(2000);
});

test("the loop exits when stopped", async () => {
  const { fetchFn } = fakeTelegram({});
  const { d } = deps(fetchFn);
  let rounds = 0;
  await runBotLoop(d, { isRunning: () => rounds++ < 2, sleep: async () => {} });
  expect(rounds).toBe(3);
});
