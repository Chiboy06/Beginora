// Real-model evaluation: runs Beginora's own orchestrator, prompt, parser and
// planner against a real small model served by Ollama (llama.cpp), instead of
// the mocked engine the unit tests use. Skipped unless REAL_MODEL is set:
//
//   ollama pull qwen3:0.6b
//   REAL_MODEL=qwen3:0.6b npx jest evals --runInBand
//
// Only generation is real; device actions are recorded instead of run.

const MODEL = process.env.REAL_MODEL;
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";

jest.mock("../../lib/store/task-store", () => ({ useTaskStore: { getState: () => ({ createTaskWithPlan: jest.fn() }) } }));
jest.mock("../../lib/llm/llm-engine", () => {
  const actual = jest.requireActual("../../lib/llm/llm-engine");
  return {
    isLoaded: () => true,
    getContextSize: () => 4096,
    estimatePromptTokens: actual.estimatePromptTokens,
    stopGeneration: async () => {},
    generate: async (
      messages: { role: string; content: string }[],
      opts: { maxTokens?: number; temperature?: number; topP?: number; enableThinking?: boolean } = {},
    ) => {
      const started = Date.now();
      // The React Native Jest preset stubs fetch, so talk to Ollama with node:http.
      const http = jest.requireActual("http") as typeof import("http");
      const post = (body: string) => new Promise<string>((resolve, reject) => {
        const req = http.request(`${process.env.OLLAMA_URL ?? "http://localhost:11434"}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }, (res) => {
          let data = "";
          res.on("data", (chunk) => { data += chunk; });
          res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.end(body);
      });
      const raw = await post(JSON.stringify({
          model: process.env.REAL_MODEL,
          messages,
          stream: false,
          think: opts.enableThinking !== false,
          options: {
            num_ctx: 4096,
            num_predict: opts.maxTokens ?? 4096,
            temperature: opts.temperature ?? 0.7,
            top_p: opts.topP ?? 0.95,
            // Same anti-loop defaults as lib/llm/llm-engine.ts.
            repeat_penalty: 1.1,
            repeat_last_n: 256,
          },
        }));
      const data = JSON.parse(raw) as { message?: { content?: string }; eval_count?: number; eval_duration?: number };
      const text = data.message?.content ?? "";
      return {
        text,
        reasoningContent: "",
        tokensPredicted: data.eval_count ?? 0,
        tokensEvaluated: 0,
        timings: { promptMs: 0, predictedMs: Date.now() - started, predictedPerSecond: 0 },
        stoppedByLimit: false,
        stoppedByUser: false,
      };
    },
  };
});
jest.mock("../../lib/orchestrator/tool-dispatcher", () => {
  const actual = jest.requireActual("../../lib/orchestrator/tool-dispatcher");
  return {
    ...actual,
    // Record device actions instead of running them; the planner still runs for real.
    dispatchToolCall: jest.fn(async (tool: string, params: Record<string, unknown>, lang: string) =>
      tool === "break_down_task" ? actual.dispatchToolCall(tool, params, lang) : { success: true, message: `ran ${tool}` }),
  };
});
jest.mock("../../lib/native/system-actions", () => ({}));
jest.mock("../../lib/native/reminders", () => ({}));
jest.mock("../../lib/native/contacts", () => ({}));
jest.mock("../../lib/native/communication", () => ({}));
jest.mock("../../lib/native/calendar", () => ({}));
jest.mock("../../lib/orchestrator/document-retriever", () => ({ queryDocuments: jest.fn() }));
jest.mock("../../lib/connectors/email-connector", () => ({}));
jest.mock("../../lib/telegram/telegram-service", () => ({}));
jest.mock("../../lib/orchestrator/memory-manager", () => ({
  getMemoriesForPrompt: async () => null,
  extractMemories: async () => {},
  shouldExtractMemory: () => false,
  cancelExtraction: () => {},
}));
jest.mock("../../lib/orchestrator/knowledge-manager", () => ({ getKnowledgeForPrompt: async () => null }));
jest.mock("../../lib/storage/database", () => ({ getConfig: async () => "true" }));
jest.mock("../../lib/orchestrator/session-warmer", () => ({ schedulePrefixPersist: () => {} }));

import { processMessage } from "../../lib/orchestrator/orchestrator";
import type { OrchestratorResponse } from "../../lib/orchestrator/types";

// Same sentence repeated, or one phrase looping, is the failure seen on phones.
export function isRepetitive(text: string): boolean {
  const sentences = text.toLowerCase().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 12);
  if (new Set(sentences).size < sentences.length) return true;
  const words = text.toLowerCase().split(/\s+/);
  for (let n = 4; n <= 8; n += 1) {
    const seen = new Map<string, number>();
    for (let i = 0; i + n <= words.length; i += 1) {
      const gram = words.slice(i, i + n).join(" ");
      seen.set(gram, (seen.get(gram) ?? 0) + 1);
      if ((seen.get(gram) ?? 0) >= 3) return true;
    }
  }
  return false;
}

type Expect = { tool?: string; text?: true; contains?: RegExp };
const CASES: [string, Expect][] = [
  ["hi", { text: true }],
  ["what is the capital of Nigeria?", { text: true, contains: /abuja/i }],
  ["set an alarm for 7 o'clock today", { tool: "set_alarm" }],
  ["Set a reminder for 5 a.m. tomorrow", { tool: "set_reminder" }],
  ["how are you?", { text: true }],
  ["add I am Batman to my calendar, I will be taking my task in the next 1 hour", { tool: "create_event" }],
  ["set an alarm for 7am tomorrow", { tool: "set_alarm" }],
  ["remind me at 6pm to call mum", { tool: "set_reminder" }],
  ["set a timer for 5 minutes", { tool: "set_timer" }],
  ["text Mum that I'm running late", { tool: "send_sms" }],
  ["what's on my calendar tomorrow?", { tool: "get_calendar_events" }],
  ["I need to start my essay but I keep avoiding it", { tool: "break_down_task" }],
  ["save a note: buy bread and call Ada", { tool: "save_note" }],
];

const run = MODEL ? describe : describe.skip;

run(`real model: ${MODEL}`, () => {
  jest.setTimeout(180_000);
  const results: { said: string; got: string; ok: boolean; repetitive: boolean; ms: number }[] = [];

  afterAll(() => {
    const passed = results.filter((r) => r.ok && !r.repetitive).length;
    console.log(
      [`REAL MODEL ${MODEL}: ${passed}/${results.length} passed`]
        .concat(results.map((r) => `${r.ok && !r.repetitive ? "PASS" : "FAIL"} ${r.ms}ms "${r.said}" -> ${r.got}${r.repetitive ? " [REPETITIVE]" : ""}`))
        .join("\n"),
    );
  });

  test.each(CASES)("%s", async (said, expected) => {
    const started = Date.now();
    const res: OrchestratorResponse = await processMessage(said, [], "en", undefined, undefined, new Date(2026, 9, 20, 15, 0));
    const ms = Date.now() - started;
    const dispatched = jest.requireMock("../../lib/orchestrator/tool-dispatcher").dispatchToolCall as jest.Mock;
    // Read tools reply in text after fetching real data: count the fetch as the action.
    const readTool = dispatched.mock.calls.map((c) => c[0]).find((t: string) => t === "get_calendar_events") ?? null;
    dispatched.mockClear();
    const tool = res.type === "tool_call" || res.type === "pending_tool_call" ? res.tool : readTool;
    const text = res.type === "text" ? res.content : res.type === "error" ? `ERROR ${res.error}` : res.message;
    // An action only counts if its details pass the app's own validation.
    const { checkToolParams } = jest.requireActual("../../lib/orchestrator/tool-dispatcher");
    const paramsValid = !(res.type === "tool_call" || res.type === "pending_tool_call") ||
      res.tool === "break_down_task" || checkToolParams(res.tool, res.parameters).error === null;
    const ok = (expected.tool ? tool === expected.tool : res.type === "text" && text.trim().length > 0) &&
      paramsValid && (!expected.contains || expected.contains.test(text)) && !/\[Time context/.test(text);
    const repetitive = isRepetitive(text);
    const params = res.type === "tool_call" || res.type === "pending_tool_call" ? JSON.stringify(res.parameters) : "";
    results.push({ said, got: tool ? `${tool} ${params} :: ${text.slice(0, 100)}` : text.slice(0, 160).replace(/\n/g, " "), ok, repetitive, ms });
    expect(ok && !repetitive).toBe(true);
  });
});

run(`real model conversation: ${MODEL}`, () => {
  jest.setTimeout(300_000);

  test("a multi-turn chat stays varied and never loops", async () => {
    const turns = ["hi", "how are you?", "what can you help me with?", "I feel overwhelmed today", "thanks"];
    const history: { id: string; conversationId: string; role: "user" | "assistant"; content: string; createdAt: number }[] = [];
    const replies: string[] = [];
    let at = new Date(2026, 9, 20, 15, 0).getTime();
    for (const said of turns) {
      const res = await processMessage(said, [...history], "en", undefined, undefined, new Date(at));
      const reply = res.type === "text" ? res.content : res.type === "error" ? `ERROR ${res.error}` : res.message;
      replies.push(reply);
      history.push({ id: `u${at}`, conversationId: "c", role: "user", content: said, createdAt: at });
      history.push({ id: `a${at}`, conversationId: "c", role: "assistant", content: reply, createdAt: at + 1 });
      at += 60_000;
    }
    console.log(replies.map((r, i) => `> ${turns[i]}\n< ${r.replace(/\n/g, " ").slice(0, 200)}`).join("\n"));
    for (const reply of replies) expect(isRepetitive(reply)).toBe(false);
    // No reply is a copy of the one before it.
    for (let i = 1; i < replies.length; i += 1) expect(replies[i]).not.toBe(replies[i - 1]);
  });
});
