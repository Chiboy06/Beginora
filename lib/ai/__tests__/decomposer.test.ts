jest.mock("../../llm/llm-engine", () => ({
  isLoaded: jest.fn(),
  generate: jest.fn(),
}));

import { isLoaded, generate } from "../../llm/llm-engine";
import { decompose } from "../decomposer";

const mockIsLoaded = isLoaded as jest.MockedFunction<typeof isLoaded>;
const mockGenerate = generate as jest.MockedFunction<typeof generate>;

describe("decompose", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses deterministic rules when no local model is loaded", async () => {
    mockIsLoaded.mockReturnValue(false);
    const result = await decompose("Write my project report");

    expect(result.source).toBe("rule_engine");
    expect(result.firstAction).toBe("Open a blank document and write just the title.");
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("accepts and trims a valid model plan", async () => {
    mockIsLoaded.mockReturnValue(true);
    mockGenerate.mockResolvedValue({
      text: JSON.stringify({
        firstAction: "  Open the document.  ",
        steps: ["Find the file", "Open it", "Read the heading"],
      }),
    } as Awaited<ReturnType<typeof generate>>);

    await expect(decompose("Complete my entire research project")).resolves.toEqual({
      firstAction: "Open the document.",
      steps: ["Find the file", "Open it", "Read the heading"],
      source: "llm",
    });
  });

  it("falls back instead of returning a malformed model response", async () => {
    mockIsLoaded.mockReturnValue(true);
    mockGenerate.mockResolvedValue({ text: "```json\n{ broken }\n```" } as Awaited<ReturnType<typeof generate>>);

    const result = await decompose("Complete my entire research project");
    expect(result.source).toBe("rule_engine");
    expect(result.firstAction).toContain("Complete my entire research project");
  });
});
