// Readable plan text for chat and Telegram replies. Type-only import so the
// Telegram code that uses it still runs in plain Node (scripts/telegram-smoke.mts).

import type { DecompositionResult } from "./decomposer";

export function formatPlan(result: DecompositionResult): string {
  if (result.source === "safety_block") return result.firstAction;
  const next = result.steps.slice(0, 3).map((step, i) => `${i + 1}. ${step}`);
  return [`First step: ${result.firstAction}`, ...(next.length ? ["", "Then:", ...next] : [])].join("\n");
}
