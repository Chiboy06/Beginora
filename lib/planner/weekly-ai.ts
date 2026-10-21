// Runs the weekly goal check on the best model available: the online model if
// the user set one up, else the phone model, else the no-AI splitter. A bad
// answer from a model falls through to the next option, never to nothing.

import { generate, getModelInfo, isLoaded } from "../llm/llm-engine";
import { isTinyModel } from "../models/format";
import { onlineSettings, remoteGenerate } from "../llm/remote-engine";
import { prefs } from "../store/prefs";
import { draftToTasks, parseWeeklyReview, weeklyMessages, type PlannedTask, type WeeklyReview } from "./weekly";

const OPTIONS = { maxTokens: 1200, temperature: 0.3 };

export async function reviewWeek(input: {
  goals: string;
  projects: string[];
  draft: string;
  carry: string[];
  now?: Date;
}): Promise<WeeklyReview> {
  const now = input.now ?? new Date();
  const messages = weeklyMessages(input.goals, input.projects, input.draft, input.carry, now);
  const fromWords = draftToTasks(input.draft, input.projects, now);
  // A model that drops items is worse than none: keep its goal check, use the
  // tasks read from the words (Qwen3 0.6B dropped 3 of 5 in testing).
  const keepAll = <T extends { tasks: PlannedTask[] }>(r: T): T => (r.tasks.length * 2 < fromWords.length ? { ...r, tasks: fromWords } : r);

  if (prefs.onlineMode !== "off") {
    try {
      const settings = await onlineSettings();
      if (settings.url && settings.model) {
        const parsed = parseWeeklyReview((await remoteGenerate(messages, OPTIONS, settings)).text, input.projects, now);
        if (parsed) return { ...keepAll(parsed), source: "online" };
      }
    } catch {
      // Offline or refused: try the phone model.
    }
  }

  // Models under 1.5B gave worse plans than the word splitter in testing.
  if (isLoaded() && !isTinyModel(getModelInfo().path ?? "")) {
    try {
      const parsed = parseWeeklyReview((await generate(messages, { ...OPTIONS, enableThinking: false })).text, input.projects, now);
      if (parsed) return { ...keepAll(parsed), source: "phone" };
    } catch {
      // Busy or failed: use the words as written.
    }
  }

  return { flags: [], tasks: fromWords, goalUpdate: null, source: "rules" };
}
