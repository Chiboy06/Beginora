// Zustand store for the model manager. Coordinates the catalog, HuggingFace
// download, the SQLite registry, and llama.rn (load/unload), and exposes live
// download progress to the Models screen.

import { create } from "zustand";
import { v4 as uuid } from "uuid";
import * as FileSystem from "expo-file-system/legacy";
import type { CatalogModel, DownloadProgress, InstalledModel } from "../models/types";
import {
  listInstalled,
  getModelById,
  getActiveModel,
  insertModel,
  setModelState,
  setResumeToken,
  finalizeModel,
  setActiveModel,
  removeModel,
} from "../models/model-registry";
import {
  downloadModel,
  cancelDownload as cancelTask,
  deleteModelFile,
  ensureModelsDir,
  modelPathFor,
} from "../models/download-manager";
import { listGgufFiles, resolveUrl, type HfFile } from "../models/hf-client";
import { getDeviceCaps, type DeviceCaps } from "../models/device-caps";
import { loadModel, unloadModel, validateGguf, getModelInfo } from "../llm/llm-engine";
import { warmSessionCache } from "../orchestrator/session-warmer";
import { getPerfSettings, perfToLlmOptions } from "../llm/perf-config";
import { useChatStore } from "./chat-store";

// Serializes the "first model auto-activates" decision so two near-simultaneous
// downloads can't both fire a (multi-GB) load (H1 TOCTOU).
let autoActivateInFlight = false;

// Pure: choose which file in a repo to download. Exact filename wins, then a
// filename containing the desired quant, then the first GGUF.
export function pickFile(
  files: HfFile[],
  preferred: string,
  quant: string,
): HfFile | null {
  if (files.length === 0) return null;
  const base = (p: string) => p.split("/").pop() ?? p;
  const exact = files.find(
    (f) => base(f.path).toLowerCase() === preferred.toLowerCase(),
  );
  if (exact) return exact;
  const byQuant = files.find((f) =>
    base(f.path).toLowerCase().includes(quant.toLowerCase()),
  );
  if (byQuant) return byQuant;
  return files[0];
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

// Older installs may have multiple registry rows pointing at the same shared
// basename path. Keep that file until the last row referencing it is removed.
async function deleteFileIfUnreferenced(
  filePath: string,
  excludingModelId?: string,
): Promise<void> {
  const models = await listInstalled();
  if (
    models.some(
      (model) => model.id !== excludingModelId && model.filePath === filePath,
    )
  ) {
    return;
  }
  await deleteModelFile(filePath);
}

interface ModelState {
  installed: InstalledModel[];
  progress: Record<string, DownloadProgress>;
  freeBytes: number | null;
  caps: DeviceCaps | null;
  busy: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  downloadFromCatalog: (model: CatalogModel) => Promise<void>;
  downloadFromRepo: (
    repo: string,
    file: HfFile,
    displayName: string,
  ) => Promise<void>;
  importLocalModel: (uri: string, name: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  reloadActive: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  // Continue a paused or interrupted download from where it stopped.
  resume: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  installed: [],
  progress: {},
  freeBytes: null,
  caps: null,
  busy: false,
  error: null,

  refresh: async () => {
    const [installed, caps] = await Promise.all([listInstalled(), getDeviceCaps()]);
    set({
      installed,
      caps,
      freeBytes: Number.isFinite(caps.freeBytes) ? caps.freeBytes : null,
    });
  },

  downloadFromCatalog: async (model: CatalogModel) => {
    set({ error: null });

    // Resolve the actual downloadable file from the live repo tree; fall back to
    // the catalog hint if the network/listing is unavailable.
    let file: HfFile;
    let exactSize = true; // size came from the HF tree API → safe to verify
    try {
      const files = await listGgufFiles(model.hfRepo);
      const picked = pickFile(files, model.preferredFile, model.quant);
      if (!picked) throw new Error("No .gguf files found in this repo.");
      file = picked;
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "GATED") {
        set({
          error: `${model.displayName} requires a HuggingFace login (gated). Support coming soon.`,
        });
        return;
      }
      // Network/listing failure — fall back to the catalog's approximate size.
      file = {
        path: model.preferredFile,
        sizeBytes: model.sizeBytesApprox,
        sha256: null,
      };
      exactSize = false;
    }

    await runDownload(set, get, {
      repo: model.hfRepo,
      file,
      exactSize,
      displayName: model.displayName,
      quant: model.quant,
      minRamMb: model.minRamMb,
      contextSize: model.contextSize,
      role: model.role,
    });
  },

  downloadFromRepo: async (repo, file, displayName) => {
    set({ error: null });
    await runDownload(set, get, {
      repo,
      file,
      exactSize: true,
      displayName,
      quant: null,
      minRamMb: null,
      contextSize: 4096,
      role: "primary",
    });
  },

  importLocalModel: async (uri: string, name: string) => {
    set({ busy: true, error: null });
    try {
      await ensureModelsDir();
      const pickedName = name.replace(/\\/g, "/").split("/").pop() || "model.gguf";
      const fileName = pickedName.endsWith(".gguf") ? pickedName : `${pickedName}.gguf`;
      const modelId = uuid();
      const finalPath = modelPathFor(fileName, modelId);
      // Single copy straight to the final path (no temp-then-load double write).
      const existing = await FileSystem.getInfoAsync(finalPath);
      if (!existing.exists) {
        await FileSystem.copyAsync({ from: uri, to: finalPath });
      }

      const valid = await validateGguf(finalPath);
      if (!valid.ok) {
        await deleteFileIfUnreferenced(finalPath);
        set({ error: valid.error ?? "Invalid GGUF file." });
        return;
      }

      const info = await FileSystem.getInfoAsync(finalPath);
      const model = await insertModel({
        id: modelId,
        displayName: fileName.replace(/\.gguf$/i, ""),
        filePath: finalPath,
        hfFile: fileName,
        sizeBytes: info.exists ? (info.size ?? 0) : 0,
        contextSize: 4096,
        role: "primary",
        state: "ready",
      });

      await get().refresh();
      const active = await getActiveModel();
      if (!active) await get().activate(model.id);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ busy: false });
    }
  },

  activate: async (id: string) => {
    set({ error: null });
    const model = await getModelById(id);
    if (!model || model.state !== "ready") {
      set({ error: "Model is not ready." });
      return;
    }
    if (model.role !== "primary") {
      set({ error: "Only primary models can be activated for chat." });
      return;
    }
    const info = await FileSystem.getInfoAsync(model.filePath);
    if (!info.exists) {
      await setModelState(id, "error");
      await get().refresh();
      set({ error: "Model file is missing — re-download it." });
      return;
    }
    try {
      const perf = perfToLlmOptions(await getPerfSettings());
      await loadModel(model.filePath, {
        ...perf,
        contextSize: model.contextSize,
        gpuLayers: 0,
        chatTemplate: model.chatTemplate ?? undefined,
      });
      // Same as the app-start path (chat-store.init): restore this model's
      // persisted prefix KV before any completion. Switching back to a model
      // whose session file is on disk skips the ~30s cold prefill.
      await warmSessionCache();
      await setActiveModel(id);
      await get().refresh();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      // Always reflect what's actually loaded in native, even if the registry
      // write failed after a successful load (H2).
      useChatStore.getState().updateModelStatus();
    }
  },

  // Reload the active model so changed perf settings (threads/mlock/KV quant)
  // take effect — a no-op if nothing is active.
  reloadActive: async () => {
    const active = await getActiveModel();
    if (!active) return;
    await unloadModel().catch(() => {});
    await get().activate(active.id);
    // activate() reports load failures via store state, never by throwing —
    // surface them here so callers (Settings updatePerf) can actually revert
    // a rejected setting instead of silently ending up with no model loaded.
    if (!getModelInfo().loaded) {
      throw new Error(get().error ?? "Model reload failed");
    }
  },

  remove: async (id: string) => {
    const model = await getModelById(id);
    if (!model) return;
    const wasActive = model.isActive;
    // Unload before deleting the file so llama isn't holding the mmap.
    if (wasActive) {
      await unloadModel().catch(() => {});
      useChatStore.getState().updateModelStatus();
    }
    await deleteFileIfUnreferenced(model.filePath, id);
    await removeModel(id);

    // Removing the active model: promote another ready model so the app isn't
    // left with no model loaded while others are installed (M1).
    if (wasActive) {
      const replacement = (await listInstalled()).find(
        (m) => m.id !== id && m.state === "ready" && m.role === "primary",
      );
      if (replacement) await get().activate(replacement.id);
    }
    await get().refresh();
  },

  resume: async (id: string) => {
    set({ error: null });
    const model = await getModelById(id);
    if (!model?.hfRepo || !model.hfFile) {
      set({ error: "This download can't be resumed. Delete it and download again." });
      return;
    }
    await setModelState(id, "downloading");
    await continueDownload(set, get, {
      id,
      url: resolveUrl(model.hfRepo, model.hfFile),
      fileName: baseName(model.filePath),
      filePath: model.filePath,
      expectedBytes: model.sizeBytes,
      // The stored size may be approximate; never fail a complete download on it.
      verifySize: false,
      role: model.role,
      resumeToken: model.resumeToken,
    });
  },

  cancel: async (id: string) => {
    await cancelTask(id);
    const model = await getModelById(id);
    if (model) {
      await deleteFileIfUnreferenced(model.filePath, id);
      await removeModel(id);
    }
    set((s) => {
      const progress = { ...s.progress };
      delete progress[id];
      return { progress };
    });
    await get().refresh();
  },

  clearError: () => set({ error: null }),
}));

// Shared download flow for catalog + ad-hoc repo downloads.
async function runDownload(
  set: (partial: Partial<ModelState> | ((s: ModelState) => Partial<ModelState>)) => void,
  get: () => ModelState,
  args: {
    repo: string;
    file: HfFile;
    exactSize: boolean;
    displayName: string;
    quant: string | null;
    minRamMb: number | null;
    contextSize: number;
    role: InstalledModel["role"];
  },
): Promise<void> {
  const fileName = baseName(args.file.path);
  const modelId = uuid();
  const filePath = modelPathFor(fileName, modelId);
  const model = await insertModel({
    id: modelId,
    displayName: args.displayName,
    hfRepo: args.repo,
    hfFile: fileName,
    filePath,
    quant: args.quant,
    sizeBytes: args.file.sizeBytes,
    minRamMb: args.minRamMb,
    sha256: args.file.sha256,
    contextSize: args.contextSize,
    role: args.role,
    state: "downloading",
  });

  await continueDownload(set, get, {
    id: model.id,
    url: resolveUrl(args.repo, args.file.path),
    fileName,
    filePath,
    expectedBytes: args.file.sizeBytes,
    verifySize: args.exactSize,
    role: args.role,
    resumeToken: null,
  });
}

interface DownloadJob {
  id: string;
  url: string;
  fileName: string;
  filePath: string;
  expectedBytes: number;
  verifySize: boolean;
  role: InstalledModel["role"];
  resumeToken: string | null;
}

// Runs (or resumes) a download and records the outcome. Shared by new
// downloads and Resume after a pause or a dropped connection.
async function continueDownload(
  set: (partial: Partial<ModelState> | ((s: ModelState) => Partial<ModelState>)) => void,
  get: () => ModelState,
  job: DownloadJob,
): Promise<void> {
  const id = job.id;
  set((s) => ({
    progress: {
      ...s.progress,
      [id]: {
        modelId: id,
        status: "downloading",
        bytesWritten: 0,
        bytesTotal: job.expectedBytes,
        bytesPerSec: 0,
        etaSeconds: null,
      },
    },
  }));
  await get().refresh();

  const outcome = await downloadModel({
    modelId: id,
    url: job.url,
    fileName: job.fileName,
    filePath: job.filePath,
    expectedBytes: job.expectedBytes,
    verifySize: job.verifySize,
    resumeToken: job.resumeToken,
    onProgress: (p) =>
      set((s) => ({
        progress: {
          ...s.progress,
          [id]: { modelId: id, status: "downloading", ...p },
        },
      })),
    onResumeToken: (token) => {
      setResumeToken(id, token).catch(() => {});
    },
  });

  // If the row was removed mid-flight (user cancel), stop — and sweep any file
  // the download may have committed in the cancel race so it can't orphan (C1).
  const stillExists = await getModelById(id);
  if (!stillExists) {
    await deleteFileIfUnreferenced(job.filePath);
    return;
  }

  // Canceled: drop the row + partial entirely (cancel() usually already did,
  // but cover the race where downloadModel returned canceled first).
  if (outcome.canceled) {
    await deleteFileIfUnreferenced(stillExists.filePath, id);
    await removeModel(id);
    set((s) => {
      const progress = { ...s.progress };
      delete progress[id];
      return { progress };
    });
    await get().refresh();
    return;
  }

  // Paused (by the user or a dropped connection): keep the row, the partial
  // file and the resume point so Resume continues where it stopped.
  if (outcome.paused) {
    await setModelState(id, "paused");
    set((s) => ({
      progress: { ...s.progress, [id]: { ...(s.progress[id] ?? { modelId: id, bytesWritten: 0, bytesTotal: job.expectedBytes, bytesPerSec: 0, etaSeconds: null }), status: "paused" } },
    }));
    await get().refresh();
    return;
  }

  if (!outcome.ok) {
    await setModelState(id, "error");
    set((s) => ({
      progress: {
        ...s.progress,
        [id]: {
          modelId: id,
          status: "error",
          bytesWritten: 0,
          bytesTotal: job.expectedBytes,
          bytesPerSec: 0,
          etaSeconds: null,
          error: outcome.error,
        },
      },
    }));
    await get().refresh();
    set({ error: outcome.error ?? "Download failed." });
    return;
  }

  // Verify it actually loads as a GGUF before marking ready.
  const valid = await validateGguf(outcome.filePath!);
  if (!valid.ok) {
    await deleteFileIfUnreferenced(outcome.filePath!, id);
    await setModelState(id, "error");
    await get().refresh();
    set({ error: valid.error ?? "Downloaded file is not a valid model." });
    return;
  }

  await finalizeModel(id, {
    filePath: outcome.filePath,
    sizeBytes: outcome.sizeBytes,
  });
  set((s) => {
    const progress = { ...s.progress };
    delete progress[id];
    return { progress };
  });
  await get().refresh();

  // Auto-activate the first model the user installs. Guarded so concurrent
  // downloads don't both pass the no-active-model check and double-load (H1).
  if (job.role === "primary" && !autoActivateInFlight) {
    autoActivateInFlight = true;
    try {
      const active = await getActiveModel();
      if (!active) await get().activate(id);
    } finally {
      autoActivateInFlight = false;
    }
  }
}
