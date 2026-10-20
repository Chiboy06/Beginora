// Locks the CANONICAL ORDER of the memories block. getTopMemories ranks by a
// decay score that embeds Date.now(), so its row order drifts with the wall
// clock even with zero DB writes. If that order leaked into the prompt, the
// stable-prefix bytes would change between turns/launches, silently
// invalidating both the in-memory KV prefix and the on-disk session cache.

// uuid ships untransformed ESM that jest-expo can't parse — never load it.
jest.mock("uuid", () => ({ v4: () => "test-uuid" }));
jest.mock("../../llm/llm-engine", () => ({
  generate: jest.fn(),
  isLoaded: jest.fn(() => true),
  stopGeneration: jest.fn(),
  getContextSize: jest.fn(() => 4096),
  estimatePromptTokens: jest.fn(() => 0),
  getModelInfo: jest.fn(() => ({ loaded: true, path: "/models/Qwen3-1.7B-Q4_K_M.gguf" })),
}));
jest.mock("../../storage/database", () => ({
  saveMemory: jest.fn(),
  getAllMemories: jest.fn(),
  getTopMemories: jest.fn(),
  findMemoryByContent: jest.fn(),
  bumpMemoryAccess: jest.fn(),
  decayMemories: jest.fn(),
}));

import { getMemoriesForPrompt } from "../memory-manager";
import { getTopMemories } from "../../storage/database";
import type { Memory } from "../../storage/database";

const mockTop = getTopMemories as jest.MockedFunction<typeof getTopMemories>;

function mem(id: string, content: string, createdAt: number): Memory {
  return {
    id,
    category: "fact",
    content,
    sourceMessageId: null,
    confidence: 1,
    accessCount: 0,
    createdAt,
    lastAccessed: createdAt,
  };
}

describe("getMemoriesForPrompt canonical ordering", () => {
  test("emits insertion order regardless of the decay-ranked row order", async () => {
    const a = mem("a", "primo fatto", 1000);
    const b = mem("b", "secondo fatto", 2000);
    const c = mem("c", "terzo fatto", 3000);

    // Decay ranking happens to return c, a, b today...
    mockTop.mockResolvedValueOnce([c, a, b]);
    const today = await getMemoriesForPrompt();
    // ...and b, c, a after the clock drifts. Same selection, different order.
    mockTop.mockResolvedValueOnce([b, c, a]);
    const nextWeek = await getMemoriesForPrompt();

    expect(today).toBe(
      "- (fact) primo fatto\n- (fact) secondo fatto\n- (fact) terzo fatto",
    );
    expect(nextWeek).toBe(today);
  });

  test("createdAt ties break deterministically by id", async () => {
    mockTop.mockResolvedValueOnce([mem("z", "zeta", 1000), mem("a", "alfa", 1000)]);
    expect(await getMemoriesForPrompt()).toBe("- (fact) alfa\n- (fact) zeta");
  });

  test("no memories → null (section omitted from the prompt)", async () => {
    mockTop.mockResolvedValueOnce([]);
    expect(await getMemoriesForPrompt()).toBeNull();
  });
});


describe("memory extraction guards", () => {
  const llm = jest.requireMock("../../llm/llm-engine");
  const db = jest.requireMock("../../storage/database");
  const { extractMemories } = jest.requireActual("../memory-manager");

  beforeEach(() => {
    jest.clearAllMocks();
    db.getAllMemories.mockResolvedValue([]);
  });

  test("a tiny model does not extract memories", async () => {
    llm.getModelInfo.mockReturnValueOnce({ loaded: true, path: "/models/Qwen3-0.6B-Q4_K_M.gguf" });
    await extractMemories([{ role: "user", content: "I work night shifts" }], "ok", "m1", "en");
    expect(llm.generate).not.toHaveBeenCalled();
  });

  test("a memory copied from the system prompt is dropped, a real fact is kept", async () => {
    llm.generate.mockResolvedValueOnce({
      text: JSON.stringify([
        { category: "preference", content: "Wants Beginora to not use clinical language and not add pressure" },
        { category: "routine", content: "Works night shifts" },
      ]),
    });
    await extractMemories([{ role: "user", content: "I work night shifts" }], "ok", "m1", "en");
    expect(db.saveMemory).toHaveBeenCalledTimes(1);
    expect(db.saveMemory.mock.calls[0][0].content).toBe("Works night shifts");
  });
});
