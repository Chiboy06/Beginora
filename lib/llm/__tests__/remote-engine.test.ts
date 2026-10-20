jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});

import { chatCompletionsUrl, remoteGenerate, wantsOnline, OnlineError } from "../remote-engine";

describe("chatCompletionsUrl", () => {
  test.each([
    ["https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1/chat/completions"],
    ["https://openrouter.ai/api/v1/", "https://openrouter.ai/api/v1/chat/completions"],
    ["https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1/chat/completions"],
    ["http://192.168.1.10:1234/v1", "http://192.168.1.10:1234/v1/chat/completions"],
  ])("%s", (base, url) => {
    expect(chatCompletionsUrl(base)).toBe(url);
  });

  test("plain http on the internet is refused, so the key is never sent unencrypted", () => {
    expect(chatCompletionsUrl("http://api.example.com/v1")).toBeNull();
    expect(chatCompletionsUrl("not a url")).toBeNull();
  });
});

describe("wantsOnline", () => {
  const tiny = () => "/m/Qwen3-0.6B-Q4_K_M.gguf";
  const big = () => "/m/Qwen3-4B-Q4_K_M.gguf";
  test("off never goes online", () => expect(wantsOnline("off", false, tiny)).toBe(false));
  test("always goes online", () => expect(wantsOnline("always", true, big)).toBe(true));
  test("when needed: no model or a tiny one", () => {
    expect(wantsOnline("fallback", false, big)).toBe(true);
    expect(wantsOnline("fallback", true, tiny)).toBe(true);
    expect(wantsOnline("fallback", true, big)).toBe(false);
  });
});

describe("remoteGenerate", () => {
  const settings = { url: "https://api.example.com/v1/chat/completions", model: "m", key: "sk-test" };
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  test("sends an OpenAI-style request with the key in the header and reads the answer", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: "Nigeria has 36 states." }, finish_reason: "stop" }], usage: { completion_tokens: 7 } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await remoteGenerate([{ role: "user", content: "How many states are in Nigeria?" }], { maxTokens: 100 }, settings);
    expect(r.text).toBe("Nigeria has 36 states.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(settings.url);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(url).not.toContain("sk-test");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", max_tokens: 100, stream: false });
  });

  test("a refused key gives a plain message without the key", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"bad key sk-test"}}' })) as unknown as typeof fetch;
    await expect(remoteGenerate([{ role: "user", content: "hi" }], {}, settings)).rejects.toThrow("The API key was refused.");
  });

  test("no connection is reported, not thrown raw", async () => {
    global.fetch = jest.fn(async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;
    await expect(remoteGenerate([{ role: "user", content: "hi" }], {}, settings)).rejects.toBeInstanceOf(OnlineError);
  });
});
