jest.mock("../../llm/llm-engine", () => ({
  isLoaded: jest.fn(() => false),
  generate: jest.fn(),
  getModelInfo: jest.fn(() => ({ loaded: true, path: "/m/Qwen3-4B-Q4_K_M.gguf" })),
}));
jest.mock("../../llm/remote-engine", () => ({ onlineSettings: jest.fn(), remoteGenerate: jest.fn() }));

import { reviewWeek } from "../weekly-ai";
import { prefs } from "../../store/prefs";

const llm = jest.requireMock("../../llm/llm-engine");
const remote = jest.requireMock("../../llm/remote-engine");
const NOW = new Date(2026, 9, 19, 9, 0);
const input = { goals: "Finish my PhD", projects: ["Thesis"], draft: "write chapter 2 by Friday, buy a new sofa", carry: [], now: NOW };
const good = '{"flags":[{"item":"Buy a new sofa","reason":"Not part of your goals."}],"tasks":[{"project":"Thesis","task":"Write chapter 2","due":"2026-10-23"}],"goalUpdate":null}';

beforeEach(() => {
  jest.clearAllMocks();
  prefs.onlineMode = "off";
  llm.isLoaded.mockReturnValue(false);
});
afterAll(() => { prefs.onlineMode = "off"; });

test("uses the online model when one is set up", async () => {
  prefs.onlineMode = "fallback";
  remote.onlineSettings.mockResolvedValue({ url: "https://x/v1/chat/completions", model: "m", key: "k" });
  remote.remoteGenerate.mockResolvedValue({ text: good });
  const r = await reviewWeek(input);
  expect(r.source).toBe("online");
  expect(r.flags[0].item).toBe("Buy a new sofa");
});

test("falls back to the phone model when the online one fails", async () => {
  prefs.onlineMode = "always";
  remote.onlineSettings.mockResolvedValue({ url: "https://x/v1/chat/completions", model: "m", key: "k" });
  remote.remoteGenerate.mockRejectedValue(new Error("offline"));
  llm.isLoaded.mockReturnValue(true);
  llm.generate.mockResolvedValue({ text: good });
  expect((await reviewWeek(input)).source).toBe("phone");
});

test("a model reply that is not usable JSON falls back to splitting the words", async () => {
  llm.isLoaded.mockReturnValue(true);
  llm.generate.mockResolvedValue({ text: "Sounds like a great week!" });
  const r = await reviewWeek(input);
  expect(r.source).toBe("rules");
  expect(r.tasks.map((t) => t.task)).toEqual(["Write chapter 2", "Buy a new sofa"]);
});

test("no model at all still gives tasks", async () => {
  const r = await reviewWeek(input);
  expect(r).toMatchObject({ source: "rules", flags: [], goalUpdate: null });
  expect(r.tasks[0]).toEqual({ project: null, task: "Write chapter 2", due: "2026-10-23" });
});

test("a tiny phone model is skipped for weekly plans", async () => {
  llm.isLoaded.mockReturnValue(true);
  llm.getModelInfo.mockReturnValueOnce({ loaded: true, path: "/m/Qwen3-0.6B-Q4_K_M.gguf" });
  const r = await reviewWeek(input);
  expect(llm.generate).not.toHaveBeenCalled();
  expect(r.source).toBe("rules");
});

test("a model that drops most items keeps its goal check but every task from the words", async () => {
  llm.isLoaded.mockReturnValue(true);
  llm.generate.mockResolvedValue({ text: '{"flags":[{"item":"Netflix","reason":"Not a goal."}],"tasks":[{"project":null,"task":"Run","due":null}],"goalUpdate":null}' });
  const r = await reviewWeek({ ...input, draft: "write chapter 2, run on Tuesday, fix the bug, call mum, binge Netflix" });
  expect(r.source).toBe("phone");
  expect(r.flags).toHaveLength(1);
  expect(r.tasks).toHaveLength(5);
});
