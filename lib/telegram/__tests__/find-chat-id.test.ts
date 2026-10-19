jest.mock("expo-secure-store", () => ({}));
jest.mock("../../storage/database", () => ({}));

import { findChatId } from "../telegram-service";

function telegram(status: number, body: unknown): typeof fetch {
  return jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
}

const msg = (id: number, type = "private", first_name = "Ada") => ({ message: { chat: { id, type, first_name } } });

test("returns the newest private chat that messaged the bot", async () => {
  const result = await findChatId("123:abc", telegram(200, { ok: true, result: [msg(111), msg(-500, "group"), msg(222, "private", "Chi")] }));
  expect(result).toEqual({ ok: true, chatId: "222", name: "Chi" });
});

test("explains what to do when nobody has messaged the bot", async () => {
  const result = await findChatId("123:abc", telegram(200, { ok: true, result: [] }));
  expect(result).toEqual({ ok: false, error: expect.stringContaining("send it") });
});

test("a wrong token gets a plain-language error", async () => {
  const result = await findChatId("bad", telegram(401, { ok: false, error_code: 401, description: "Unauthorized" }));
  expect(result).toEqual({ ok: false, error: "That bot token is not valid." });
});

test("an empty token never calls Telegram", async () => {
  const fetchFn = telegram(200, {});
  expect(await findChatId("  ", fetchFn)).toEqual({ ok: false, error: "Enter the bot token first." });
  expect(fetchFn).not.toHaveBeenCalled();
});

test("a network failure is reported, not thrown", async () => {
  const fetchFn = jest.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  expect(await findChatId("123:abc", fetchFn)).toEqual({ ok: false, error: expect.stringContaining("Could not reach") });
});
