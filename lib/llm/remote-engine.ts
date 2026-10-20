// Optional online model through any OpenAI-compatible chat API (OpenAI,
// OpenRouter, Groq, Together, Google Gemini's OpenAI endpoint, or LM Studio /
// Ollama on the home network). Off unless the user turns it on in Settings.
// The key lives in SecureStore and is never logged or put in a URL.

import * as SecureStore from "expo-secure-store";
import { prefs } from "../store/prefs";
import { isTinyModel } from "../models/format";
import type { CompletionMessage, CompletionResult } from "./llm-engine";

const KEY_NAME = "online_api_key";
const TIMEOUT_MS = 20_000;

export async function getOnlineKey(): Promise<string> {
  return (await SecureStore.getItemAsync(KEY_NAME)) ?? "";
}

export async function setOnlineKey(key: string): Promise<void> {
  const k = key.trim();
  if (k) await SecureStore.setItemAsync(KEY_NAME, k);
  else await SecureStore.deleteItemAsync(KEY_NAME);
}

// Plain http is allowed only on this phone or the home network (LM Studio,
// Ollama); anything on the internet must use https so the key is encrypted.
function isLocalHost(host: string): boolean {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.endsWith(".local");
}

// The full chat-completions URL for a base URL, or null when it is unsafe or invalid.
export function chatCompletionsUrl(base: string): string | null {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) return null;
  const path = url.pathname.replace(/\/+$/, "");
  url.pathname = path.endsWith("/chat/completions") ? path : `${path}/chat/completions`;
  return url.toString();
}

export interface OnlineSettings {
  url: string | null;
  model: string;
  key: string;
}

export async function onlineSettings(): Promise<OnlineSettings> {
  return { url: chatCompletionsUrl(prefs.onlineBaseUrl), model: prefs.onlineModel, key: await getOnlineKey() };
}

// Whether this question goes online. Actions never do: they run on the phone.
export function wantsOnline(
  mode: "off" | "fallback" | "always",
  modelReady: boolean,
  modelPath: () => string,
): boolean {
  if (mode === "always") return true;
  if (mode === "fallback") return !modelReady || isTinyModel(modelPath());
  return false;
}

export class OnlineError extends Error {}

export async function remoteGenerate(
  messages: CompletionMessage[],
  opts: { maxTokens?: number; temperature?: number; topP?: number } = {},
  settings?: OnlineSettings,
): Promise<CompletionResult> {
  const s = settings ?? (await onlineSettings());
  if (!s.url) throw new OnlineError("The online model address is missing or not https.");
  if (!s.model) throw new OnlineError("No online model name is set.");
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(s.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(s.key ? { Authorization: `Bearer ${s.key}` } : {}),
      },
      body: JSON.stringify({
        model: s.model,
        messages,
        max_tokens: opts.maxTokens ?? 512,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.9,
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new OnlineError(controller.signal.aborted ? "The online model took too long to answer." : "No internet connection to the online model.");
  } finally {
    clearTimeout(timer);
  }
  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {}
  if (!res.ok) {
    const reason = typeof data?.error?.message === "string" ? data.error.message : `HTTP ${res.status}`;
    throw new OnlineError(res.status === 401 || res.status === 403 ? "The API key was refused." : `The online model said: ${reason.slice(0, 160)}`);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new OnlineError("The online model sent an answer Beginora could not read.");
  return {
    text,
    reasoningContent: "",
    tokensPredicted: Number(data?.usage?.completion_tokens) || 0,
    tokensEvaluated: Number(data?.usage?.prompt_tokens) || 0,
    timings: { promptMs: 0, predictedMs: Date.now() - started, predictedPerSecond: 0 },
    stoppedByLimit: data?.choices?.[0]?.finish_reason === "length",
    stoppedByUser: false,
  };
}

// Settings > Online model > Test connection.
export async function testOnline(settings: OnlineSettings): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await remoteGenerate([{ role: "user", content: "Reply with the single word OK." }], { maxTokens: 10, temperature: 0 }, settings);
    return { ok: true, message: `Connected. The model replied: "${r.text.trim().slice(0, 40)}"` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
