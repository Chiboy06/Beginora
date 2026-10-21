// Runs the weekly goal check local first: the phone model, then the user's
// online model, then the no-AI splitter. A bad answer from a model falls
// through to the next option, never to nothing.

import { generate, getModelInfo, isLoaded } from "../llm/llm-engine";
import { isTinyModel } from "../models/format";
import { onlineSettings, remoteGenerate } from "../llm/remote-engine";
import { prefs } from "../store/prefs";
import { draftToTasks, parseSummary, parseWeeklyReview, summaryMessages, weeklyMessages, type PlannedTask, type WeeklyReview } from "./weekly";
import type { CompletionMessage } from "../llm/llm-engine";

const OPTIONS = { maxTokens: 1200, temperature: 0.3 };

export async function reviewWeek(input: {
  goals: string;
  projects: string[];
  draft: string;
  carry: string[];
  guide?: string;
  now?: Date;
}): Promise<WeeklyReview> {
  const now = input.now ?? new Date();
  const messages = weeklyMessages(input.goals, input.projects, input.draft, input.carry, now, input.guide);
  const fromWords = draftToTasks(input.draft, input.projects, now);
  // A model that drops items is worse than none: keep its goal check, use the
  // tasks read from the words (Qwen3 0.6B dropped 3 of 5 in testing).
  const keepAll = <T extends { tasks: PlannedTask[] }>(r: T): T => (r.tasks.length * 2 < fromWords.length ? { ...r, tasks: fromWords } : r);

  for await (const answer of answers(messages)) {
    const parsed = parseWeeklyReview(answer.text, input.projects, now);
    if (parsed) return { ...keepAll(parsed), source: answer.source };
  }

  return { flags: [], tasks: fromWords, goalUpdate: null, source: "rules" };
}

// Local first: answers from the phone model (1.5B or more; smaller ones gave
// worse plans than the word splitter in testing), then from the user's online
// model. A failed or unusable answer moves on to the next one.
async function* answers(messages: CompletionMessage[]): AsyncGenerator<{ text: string; source: "phone" | "online" }> {
  if (isLoaded() && !isTinyModel(getModelInfo().path ?? "")) {
    try {
      yield { text: (await generate(messages, { ...OPTIONS, enableThinking: false })).text, source: "phone" };
    } catch {
      // Busy or failed: try the online model.
    }
  }
  if (prefs.onlineMode !== "off") {
    try {
      const settings = await onlineSettings();
      if (settings.url && settings.model) yield { text: (await remoteGenerate(messages, OPTIONS, settings)).text, source: "online" };
    } catch {
      // Offline or refused: the caller falls back to rules.
    }
  }
}

// "Summarise this and add it to my goals." Null means keep the words as spoken.
export async function summariseGoals(raw: string): Promise<{ summary: string; projects: string[] } | null> {
  if (raw.trim().length < 20) return null;
  for await (const answer of answers(summaryMessages(raw))) {
    const parsed = parseSummary(answer.text);
    if (parsed) return parsed;
  }
  return null;
}
