import { CATALOG } from "../../models/catalog";
import type { InstalledModel } from "../../models/types";
import { deleteModelFile, downloadModel } from "../../models/download-manager";
import { finalizeModel, removeModel, setActiveModel } from "../../models/model-registry";
import { useModelStore } from "../model-store";

jest.mock("uuid", () => {
  let next = 0;
  return { v4: jest.fn(() => `test-model-${++next}`) };
});

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 100 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
}));

jest.mock("../../models/model-registry", () => {
  const rows: InstalledModel[] = [];
  let activeOverride: InstalledModel | null = null;
  const byId = (id: string) => rows.find((row) => row.id === id) ?? null;
  return {
    __rows: rows,
    __setActiveOverride: (model: InstalledModel | null) => {
      activeOverride = model;
    },
    listInstalled: jest.fn(async () => rows.map((row) => ({ ...row }))),
    getModelById: jest.fn(async (id: string) => {
      const row = byId(id);
      return row ? { ...row } : null;
    }),
    getActiveModel: jest.fn(async () => {
      if (activeOverride) return { ...activeOverride };
      const row = rows.find((candidate) => candidate.isActive && candidate.state === "ready");
      return row ? { ...row } : null;
    }),
    insertModel: jest.fn(async (model: Partial<InstalledModel> & { displayName: string; filePath: string }) => {
      const row: InstalledModel = {
        id: model.id ?? `model-${rows.length + 1}`,
        displayName: model.displayName,
        hfRepo: model.hfRepo ?? null,
        hfFile: model.hfFile ?? null,
        filePath: model.filePath,
        quant: model.quant ?? null,
        sizeBytes: model.sizeBytes ?? 0,
        minRamMb: model.minRamMb ?? null,
        chatTemplate: model.chatTemplate ?? null,
        contextSize: model.contextSize ?? 4096,
        role: model.role ?? "primary",
        state: model.state ?? "downloading",
        resumeToken: model.resumeToken ?? null,
        sha256: model.sha256 ?? null,
        isActive: false,
        createdAt: Date.now(),
      };
      rows.push(row);
      return { ...row };
    }),
    setModelState: jest.fn(async (id: string, state: InstalledModel["state"]) => {
      const row = byId(id);
      if (row) row.state = state;
    }),
    setResumeToken: jest.fn(async () => {}),
    finalizeModel: jest.fn(async (id: string, fields: Partial<InstalledModel>) => {
      const row = byId(id);
      if (row) {
        row.state = "ready";
        if (fields.filePath) row.filePath = fields.filePath;
        if (fields.sizeBytes !== undefined) row.sizeBytes = fields.sizeBytes;
      }
    }),
    setActiveModel: jest.fn(async (id: string) => {
      rows.forEach((row) => { row.isActive = row.id === id; });
    }),
    removeModel: jest.fn(async (id: string) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    }),
  };
});

jest.mock("../../models/download-manager", () => ({
  downloadModel: jest.fn(async (params: { filePath?: string; fileName: string; expectedBytes: number }) => ({
    ok: true,
    filePath: params.filePath ?? `file:///docs/models/${params.fileName}`,
    sizeBytes: params.expectedBytes,
  })),
  cancelDownload: jest.fn(async () => {}),
  deleteModelFile: jest.fn(async () => {}),
  ensureModelsDir: jest.fn(async () => {}),
  modelPathFor: jest.fn((fileName: string, modelId?: string) =>
    `file:///docs/models/${modelId ? `${modelId}-` : ""}${fileName}`,
  ),
}));

jest.mock("../../models/hf-client", () => ({
  listGgufFiles: jest.fn(async () => []),
  resolveUrl: jest.fn((repo: string, file: string) => `https://hf/${repo}/${file}`),
}));
jest.mock("../../models/device-caps", () => ({
  getDeviceCaps: jest.fn(async () => ({ freeBytes: 1000, totalRamMb: 8192, deviceName: "test" })),
}));
jest.mock("../../llm/llm-engine", () => ({
  loadModel: jest.fn(async () => {}),
  unloadModel: jest.fn(async () => {}),
  validateGguf: jest.fn(async () => ({ ok: true })),
  getModelInfo: jest.fn(() => ({ loaded: false })),
}));
jest.mock("../../orchestrator/session-warmer", () => ({ warmSessionCache: jest.fn(async () => {}) }));
jest.mock("../../llm/perf-config", () => ({
  getPerfSettings: jest.fn(async () => ({})),
  perfToLlmOptions: jest.fn(() => ({})),
}));
jest.mock("../chat-store", () => ({
  useChatStore: { getState: () => ({ updateModelStatus: jest.fn() }) },
}));

const registryHarness = require("../../models/model-registry") as typeof import("../../models/model-registry") & {
  __rows: InstalledModel[];
  __setActiveOverride: (model: InstalledModel | null) => void;
};

function installed(overrides: Partial<InstalledModel> = {}): InstalledModel {
  return {
    id: "existing-primary",
    displayName: "Existing primary",
    hfRepo: "owner/existing",
    hfFile: "model.gguf",
    filePath: "file:///docs/models/existing.gguf",
    quant: null,
    sizeBytes: 100,
    minRamMb: null,
    chatTemplate: null,
    contextSize: 4096,
    role: "primary",
    state: "ready",
    resumeToken: null,
    sha256: null,
    isActive: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  registryHarness.__rows.splice(0);
  registryHarness.__setActiveOverride(null);
  useModelStore.setState({ installed: [], progress: {}, freeBytes: null, caps: null, busy: false, error: null });
});

describe("model-store model roles and download paths", () => {
  it("gives local imports unique sanitized paths even when their filenames match", async () => {
    await useModelStore.getState().importLocalModel("content://first", "nested\\model.gguf");
    await useModelStore.getState().importLocalModel("content://second", "other/model.gguf");

    expect(registryHarness.__rows).toHaveLength(2);
    const [first, second] = registryHarness.__rows;
    expect(first.filePath).not.toBe(second.filePath);
    expect(first.filePath).toContain(`${first.id}-model.gguf`);
    expect(second.filePath).toContain(`${second.id}-model.gguf`);
    expect(first.filePath).not.toContain("nested");
    expect(second.filePath).not.toContain("other/");
  });

  it("installs an embedding model without auto-activating it and rejects chat activation", async () => {
    const embedder = CATALOG.find((model) => model.role === "embedding")!;
    const { listGgufFiles } = require("../../models/hf-client") as typeof import("../../models/hf-client");
    (listGgufFiles as jest.Mock).mockResolvedValue([{
      path: embedder.preferredFile,
      sizeBytes: 90,
      sha256: null,
    }]);

    await useModelStore.getState().downloadFromCatalog(embedder);

    expect(registryHarness.__rows).toHaveLength(1);
    const row = registryHarness.__rows[0];
    expect(row).toMatchObject({ role: "embedding", state: "ready" });
    expect(finalizeModel).toHaveBeenCalledWith(row.id, expect.objectContaining({ filePath: row.filePath }));
    expect(setActiveModel).not.toHaveBeenCalled();

    await useModelStore.getState().activate(row.id);
    expect(useModelStore.getState().error).toMatch(/only primary models/i);
    expect(setActiveModel).not.toHaveBeenCalled();
  });

  it("gives same-basename downloads from different repositories separate paths and deletes independently", async () => {
    registryHarness.__setActiveOverride(installed({ isActive: true }));
    const file = { path: "nested/model.gguf", sizeBytes: 100, sha256: null };

    await useModelStore.getState().downloadFromRepo("first/repository", file, "First");
    await useModelStore.getState().downloadFromRepo("second/repository", file, "Second");

    expect(registryHarness.__rows).toHaveLength(2);
    const [first, second] = registryHarness.__rows;
    expect(first.hfRepo).toBe("first/repository");
    expect(second.hfRepo).toBe("second/repository");
    expect(first.filePath).not.toBe(second.filePath);
    expect(first.filePath).toContain(`${first.id}-model.gguf`);
    expect(second.filePath).toContain(`${second.id}-model.gguf`);
    expect(downloadModel).toHaveBeenNthCalledWith(1, expect.objectContaining({ filePath: first.filePath }));
    expect(downloadModel).toHaveBeenNthCalledWith(2, expect.objectContaining({ filePath: second.filePath }));

    await useModelStore.getState().remove(first.id);

    expect(deleteModelFile).toHaveBeenCalledTimes(1);
    expect(deleteModelFile).toHaveBeenCalledWith(first.filePath);
    expect(registryHarness.__rows).toEqual([expect.objectContaining({ id: second.id, filePath: second.filePath })]);
    expect(removeModel).toHaveBeenCalledWith(first.id);
  });

  it("does not delete a legacy shared path while another model row references it", async () => {
    const sharedPath = "file:///docs/models/model.gguf";
    registryHarness.__rows.push(
      installed({ id: "legacy-a", filePath: sharedPath }),
      installed({ id: "legacy-b", filePath: sharedPath, hfRepo: "another/repository" }),
    );

    await useModelStore.getState().remove("legacy-a");

    expect(deleteModelFile).not.toHaveBeenCalled();
    expect(registryHarness.__rows).toEqual([expect.objectContaining({ id: "legacy-b", filePath: sharedPath })]);
  });
});
