// Tests the malformed-JSON retry-once-with-correction path in processMessage
// (GAMEPLAN Fase 2 exit gate: "if JSON is malformed, retry once with a
// correction prompt. If still fails, respond as general_chat").
//
// Only the native-touching modules are mocked; response-parser, tool-registry
// and prompt-builder run for real so the retry decision is exercised end-to-end.

import { processMessage } from "../orchestrator";
import { generate } from "../../llm/llm-engine";
import { dispatchToolCall } from "../tool-dispatcher";

jest.mock("../../llm/llm-engine", () => ({
  generate: jest.fn(),
  isLoaded: jest.fn(() => true),
  estimatePromptTokens: jest.fn(() => 0),
  getContextSize: jest.fn(() => 4096),
}));
jest.mock("../tool-dispatcher", () => ({
  dispatchToolCall: jest.fn(),
  // The real repair-and-validate step, so these tests see what the app would confirm.
  checkToolParams: (tool: string, parameters: Record<string, unknown>) =>
    jest.requireActual("../tool-dispatcher").checkToolParams(tool, parameters),
}));
jest.mock("../document-retriever", () => ({ queryDocuments: jest.fn() }));
jest.mock("../../native/system-actions", () => ({}));
jest.mock("../../native/reminders", () => ({}));
jest.mock("../../native/contacts", () => ({}));
jest.mock("../../native/communication", () => ({}));
jest.mock("../../native/calendar", () => ({}));
jest.mock("../../connectors/email-connector", () => ({}));
jest.mock("../../telegram/telegram-service", () => ({}));
jest.mock("../../store/task-store", () => ({ useTaskStore: { getState: () => ({}) } }));
jest.mock("../memory-manager", () => ({
  getMemoriesForPrompt: jest.fn(async () => null),
  extractMemories: jest.fn(async () => {}),
  shouldExtractMemory: jest.fn(() => false),
  cancelExtraction: jest.fn(),
}));
jest.mock("../knowledge-manager", () => ({
  getKnowledgeForPrompt: jest.fn(async () => null),
}));
jest.mock("../session-warmer", () => ({
  schedulePrefixPersist: jest.fn(),
}));
jest.mock("../../storage/database", () => ({
  getConfig: jest.fn(async () => "true"),
}));

const mockGenerate = generate as jest.MockedFunction<typeof generate>;
const mockDispatch = dispatchToolCall as jest.MockedFunction<typeof dispatchToolCall>;

// Minimal CompletionResult with only `text`/`stoppedByUser` mattering here.
function gen(text: string, opts: { stoppedByUser?: boolean } = {}) {
  return {
    text,
    reasoningContent: "",
    tokensPredicted: 0,
    tokensEvaluated: 0,
    timings: { promptMs: 0, predictedMs: 0, predictedPerSecond: 0 },
    stoppedByLimit: false,
    stoppedByUser: opts.stoppedByUser ?? false,
  };
}

describe("processMessage — malformed-JSON retry-once-with-correction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries once with a correction prompt, then dispatches the corrected tool call", async () => {
    mockGenerate
      // First pass: truncated tool JSON (looks like a tool attempt, won't parse)
      .mockResolvedValueOnce(gen('{"tool":"set_timer","parameters":{"minutes":'))
      // Correction pass: valid JSON
      .mockResolvedValueOnce(gen('{"tool":"set_timer","parameters":{"minutes":5}}'));
    mockDispatch.mockResolvedValue({
      success: true,
      message: "Timer impostato per 5 minuti",
    });

    const res = await processMessage("timer di 5 minuti", [], "it");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // The correction turn must ask for JSON-only.
    const correctionMessages = mockGenerate.mock.calls[1][0];
    expect(JSON.stringify(correctionMessages)).toMatch(/JSON/i);
    expect(res.type).toBe("tool_call");
    if (res.type === "tool_call") {
      expect(res.tool).toBe("set_timer");
      expect(res.parameters).toEqual({ minutes: 5 });
    }
    expect(mockDispatch).toHaveBeenCalledWith("set_timer", { minutes: 5 }, "it");
  });

  it("gates a corrected destructive tool for confirmation", async () => {
    mockGenerate
      .mockResolvedValueOnce(gen('{"tool":"make_call","parameters":{"contact":'))
      .mockResolvedValueOnce(gen('{"tool":"make_call","parameters":{"contact":"Ada"}}'));

    const res = await processMessage("chiama Ada", [], "it");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res.type).toBe("pending_tool_call");
    // Gated: the device is not touched during routing.
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("falls back to general chat when the retry returns plain prose", async () => {
    mockGenerate
      .mockResolvedValueOnce(gen('{"tool":"set_timer","parameters":{"minutes":'))
      .mockResolvedValueOnce(gen("Certo, posso aiutarti a impostare un timer."));

    const res = await processMessage("timer", [], "it");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res).toEqual({
      type: "text",
      content: "Certo, posso aiutarti a impostare un timer.",
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("shows the truncation hint when the retry is still a broken tool attempt", async () => {
    mockGenerate
      .mockResolvedValueOnce(gen('{"tool":"set_alarm","parameters":{"time":"07:'))
      .mockResolvedValueOnce(gen('{"tool":"set_alarm","parameters":{"time":"07:'));

    const res = await processMessage("wake me", [], "en");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res.type).toBe("text");
    if (res.type === "text") {
      expect(res.content).toMatch(/cut off/i);
    }
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("does not retry when the first pass already parses", async () => {
    mockGenerate.mockResolvedValueOnce(
      gen('{"tool":"set_timer","parameters":{"minutes":10}}'),
    );
    mockDispatch.mockResolvedValue({ success: true, message: "ok" });

    const res = await processMessage("timer 10", [], "en");

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.type).toBe("tool_call");
  });

  it("does not retry a plain-text (non-tool) reply", async () => {
    mockGenerate.mockResolvedValueOnce(gen("Ciao! Come posso aiutarti?"));

    const res = await processMessage("ciao", [], "it");

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ type: "text", content: "Ciao! Come posso aiutarti?" });
  });

  it("does NOT retry when the user stopped the first pass mid-stream", async () => {
    // A Stop tap makes the first completion resolve early with partial JSON.
    mockGenerate.mockResolvedValueOnce(
      gen('{"tool":"set_timer","parameters":{"minutes":', {
        stoppedByUser: true,
      }),
    );

    const res = await processMessage("timer di 5 minuti", [], "it");

    // No correction pass — the user asked to stop.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.type).toBe("text");
    if (res.type === "text") expect(res.content).toMatch(/troncata/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("shows the hint (not a blank bubble) when the retry returns empty output", async () => {
    mockGenerate
      .mockResolvedValueOnce(gen('{"tool":"set_timer","parameters":{"minutes":'))
      .mockResolvedValueOnce(gen("   ")); // whitespace-only retry

    const res = await processMessage("timer", [], "it");

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res.type).toBe("text");
    if (res.type === "text") expect(res.content).toMatch(/troncata/i);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("processMessage — break_down_task answers with the plan", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the planner's first step, not the model's question back", async () => {
    mockGenerate.mockResolvedValueOnce(
      gen('{"tool":"break_down_task","parameters":{"task":"start my essay"},"message":"Sure! What is your essay about?"}'),
    );
    mockDispatch.mockResolvedValue({ success: true, message: "First step: Open the document and write one sentence" });

    const res = await processMessage("I need to start my essay", [], "en");

    expect(res.type).toBe("tool_call");
    if (res.type === "tool_call") expect(res.message).toBe("First step: Open the document and write one sentence");
  });

  it("action messages are written by the app from the parameters, not the model", async () => {
    mockGenerate.mockResolvedValueOnce(gen('{"tool":"set_timer","parameters":{"minutes":5},"message":"Timer set."}'));
    mockDispatch.mockResolvedValue({ success: true, message: "native says ok" });

    const res = await processMessage("start a timer", [], "en");

    if (res.type === "tool_call") expect(res.message).toBe("Timer set for 5 minutes.");
  });
});

describe("processMessage — small-model safety nets", () => {
  beforeEach(() => jest.clearAllMocks());
  const AT = new Date(2026, 9, 20, 15, 10);

  it("a calendar question reads the real calendar without asking the model which tool", async () => {
    mockDispatch.mockResolvedValue({ success: true, message: "ok", data: "[]" });
    mockGenerate.mockResolvedValueOnce(gen("You have nothing scheduled tomorrow."));
    await processMessage("what's on my calendar tomorrow?", [], "en", undefined, undefined, AT);
    expect(mockDispatch).toHaveBeenCalledWith("get_calendar_events", { date: "2026-10-21" }, "en");
    // Only the answer is generated, from the returned events.
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it("'in the next 1 hour' is computed from the clock and the title is cleaned", async () => {
    mockGenerate.mockResolvedValueOnce(gen(
      '{"tool":"create_event","parameters":{"title":"Add I am Batman to my calendar","start":"2026-10-20T15:00 (Africa/Lagos)"},"message":"Confirmation message for the user"}',
    ));
    const res = await processMessage("add I am Batman to my calendar, I will be taking my task in the next 1 hour", [], "en", undefined, undefined, AT);
    expect(res.type).toBe("pending_tool_call");
    if (res.type === "pending_tool_call") {
      expect(res.parameters).toMatchObject({ title: "I am Batman", start: "2026-10-20T16:10:00" });
      expect(res.message).toContain('Add "I am Batman" to your calendar');
      expect(res.message).not.toContain("Confirmation message");
    }
  });

  it("details that can't be understood are asked again instead of confirmed", async () => {
    mockGenerate.mockResolvedValueOnce(gen('{"tool":"set_reminder","parameters":{"text":"x","datetime":"sometime soon"}}'));
    const res = await processMessage("remind me sometime soon", [], "en", undefined, undefined, AT);
    expect(res).toEqual({ type: "text", content: expect.stringContaining("didn't catch the time") });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("processMessage — notes keep the user's words", () => {
  it("uses the words after 'note' instead of the model's rewrite", async () => {
    jest.clearAllMocks();
    mockGenerate.mockResolvedValueOnce(gen('{"tool":"save_note","parameters":{"text":"Buy bread today at 9 AM"}}'));
    mockDispatch.mockResolvedValue({ success: true, message: "Note shared." });
    const res = await processMessage("save a note: buy bread and call Ada", [], "en");
    if (res.type === "tool_call") expect(res.parameters).toEqual({ text: "buy bread and call Ada" });
    expect(mockDispatch).toHaveBeenCalledWith("save_note", { text: "buy bread and call Ada" }, "en");
  });
});

describe("withoutTimeTags", () => {
  it("removes the internal time tag a model echoes back", () => {
    const { withoutTimeTags } = jest.requireActual("../orchestrator");
    expect(withoutTimeTags("The capital of Nigeria is Abuja.   [Time context: Tuesday 2026-10-20T15:00]")).toBe("The capital of Nigeria is Abuja.");
    expect(withoutTimeTags("[Contesto temporale: martedì]\nCiao")).toBe("Ciao");
  });
});

describe("processMessage — repeated answers", () => {
  beforeEach(() => jest.clearAllMocks());
  const previous = [
    { id: "u1", conversationId: "c", role: "user" as const, content: "how many states does Nigeria have", createdAt: 1 },
    { id: "a1", conversationId: "c", role: "assistant" as const, content: "Nigeria has 20 states.", createdAt: 2 },
  ];

  it("a retry that gives a new answer is used", async () => {
    mockGenerate.mockResolvedValueOnce(gen("Nigeria has 20 states.")).mockResolvedValueOnce(gen("Nigeria has 36 states."));
    const res = await processMessage("list all the states", previous, "en");
    expect(res).toEqual({ type: "text", content: "Nigeria has 36 states." });
  });

  it("the same answer twice becomes an honest 'not sure' instead of a repeat", async () => {
    mockGenerate.mockResolvedValueOnce(gen("Nigeria has 20 states.")).mockResolvedValueOnce(gen("Nigeria has 20 states."));
    const res = await processMessage("list all the states", previous, "en");
    expect(res).toEqual({ type: "text", content: expect.stringContaining("I'm not sure") });
  });
});
