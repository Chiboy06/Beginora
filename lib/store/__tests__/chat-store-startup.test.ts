jest.mock("uuid", () => ({ v4: () => "test-conversation" }));
jest.mock("../../orchestrator/orchestrator", () => ({
  processMessage: jest.fn(),
  executeToolCall: jest.fn(),
}));
jest.mock("../../storage/database", () => ({
  saveMessage: jest.fn(),
  getMessages: jest.fn(),
  getConfig: jest.fn(),
  setConfig: jest.fn(),
  createConversation: jest.fn(),
  getLatestConversation: jest.fn(),
  updateConversationTitle: jest.fn(),
  touchConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateMessageToolResult: jest.fn(),
}));
jest.mock("../../llm/llm-engine", () => ({
  loadModel: jest.fn(),
  isLoaded: jest.fn(),
  getModelInfo: jest.fn(),
  stopGeneration: jest.fn(),
}));
jest.mock("../../llm/perf-config", () => ({
  getPerfSettings: jest.fn(),
  perfToLlmOptions: jest.fn(),
}));
jest.mock("../../orchestrator/memory-manager", () => ({ runMemoryDecay: jest.fn() }));
jest.mock("../../orchestrator/session-warmer", () => ({ warmSessionCache: jest.fn() }));
jest.mock("../../llm/session-cache", () => ({ clearPrefixSessionCache: jest.fn() }));
jest.mock("../notices", () => ({
  persistFailureNotice: jest.fn(() => "Storage warning"),
  modelLoadFailureNotice: jest.fn(() => "Model load warning"),
}));
jest.mock("expo-file-system/legacy", () => ({ getInfoAsync: jest.fn() }));
jest.mock("../../models/model-registry", () => ({
  ensureLegacyMigration: jest.fn(),
  getActiveModel: jest.fn(),
  setModelState: jest.fn(),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as database from "../../storage/database";
import * as llm from "../../llm/llm-engine";
import { getPerfSettings, perfToLlmOptions } from "../../llm/perf-config";
import { warmSessionCache } from "../../orchestrator/session-warmer";
import { runMemoryDecay } from "../../orchestrator/memory-manager";
import * as modelRegistry from "../../models/model-registry";
import { useChatStore } from "../chat-store";

const selectedModel = {
  id: "model-1",
  displayName: "Test model",
  hfRepo: null,
  hfFile: null,
  filePath: "/models/test.gguf",
  quant: "Q4",
  sizeBytes: 10,
  minRamMb: null,
  chatTemplate: null,
  contextSize: 1024,
  role: "primary" as const,
  state: "ready" as const,
  resumeToken: null,
  sha256: null,
  isActive: true,
  createdAt: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  (database.getConfig as jest.Mock).mockResolvedValue("en");
  (database.getLatestConversation as jest.Mock).mockResolvedValue(null);
  (modelRegistry.ensureLegacyMigration as jest.Mock).mockResolvedValue(undefined);
  (modelRegistry.getActiveModel as jest.Mock).mockResolvedValue(selectedModel);
  (modelRegistry.setModelState as jest.Mock).mockResolvedValue(undefined);
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  (getPerfSettings as jest.Mock).mockResolvedValue({ threads: 4 });
  (perfToLlmOptions as jest.Mock).mockReturnValue({ threads: 4 });
  (llm.isLoaded as jest.Mock).mockReturnValue(false);
  (llm.getModelInfo as jest.Mock).mockReturnValue({ loaded: false });
  (runMemoryDecay as jest.Mock).mockResolvedValue(undefined);
  (warmSessionCache as jest.Mock).mockResolvedValue(undefined);
  useChatStore.setState({
    language: "en",
    messages: [],
    modelLoaded: false,
    modelLoading: false,
    modelPath: null,
    notice: null,
  });
});

test("chat initialization completes while native model loading is still pending", async () => {
  let finishModelLoad!: () => void;
  const stalledModelLoad = new Promise<void>((resolve) => { finishModelLoad = resolve; });
  (llm.loadModel as jest.Mock).mockReturnValue(stalledModelLoad);

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    useChatStore.getState().init().then(() => "ready" as const),
    new Promise<"blocked">((resolve) => {
      deadline = setTimeout(() => resolve("blocked"), 150);
    }),
  ]);
  if (deadline) clearTimeout(deadline);

  expect(result).toBe("ready");
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  expect(llm.loadModel).toHaveBeenCalledTimes(1);
  expect(useChatStore.getState().modelLoading).toBe(true);

  finishModelLoad();
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  expect(useChatStore.getState().modelLoading).toBe(false);
});
