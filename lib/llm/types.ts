export interface LlmOptions {
  contextSize?: number;
  gpuLayers?: number;
  threads?: number;
  useMlock?: boolean;
  // KV-cache quantization (e.g. "q8_0") — halves KV memory so longer contexts
  // fit, at a small quality cost. Undefined leaves the cache at f16.
  kvCacheType?: "f16" | "q8_0" | "q4_0";
  // Optional per-model chat template (Jinja). When a GGUF ships a wrong/missing
  // template, pass the correct one so tool-call JSON stays parseable.
  chatTemplate?: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
  // Repetition control. Without a penalty, low-temperature decoding on long
  // free-text answers can fall into an endless loop (the model repeats the same
  // phrase until it hits the token limit). >1.0 penalizes recently-seen tokens.
  penaltyRepeat?: number;
  penaltyLastN?: number;
  // Qwen3's non-thinking settings (model card): top_k 20, min_p 0, and a
  // presence penalty against endless repetition. Unset keeps llama.cpp defaults.
  topK?: number;
  minP?: number;
  penaltyPresent?: number;
  // When false, suppresses Qwen3-style chain-of-thought for this turn (faster).
  // Leave undefined to use the model's default (thinking on).
  enableThinking?: boolean;
}

export interface ModelInfo {
  loaded: boolean;
  path?: string;
}
