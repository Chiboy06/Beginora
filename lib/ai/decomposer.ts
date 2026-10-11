import { isLoaded, generate } from "../llm/llm-engine";
import { scoreComplexity, getRuleEngineAction } from "./rule-engine";

export interface DecompositionResult {
  firstAction: string;
  steps: string[];
  source: "llm" | "rule_engine";
}

const DECOMPOSE_PROMPT = (task: string, context?: string) => `You are Beginora, a calm assistant that helps people start tasks.

The user wants to work on: "${task}"${context ? `\nContext: ${context}` : ""}

Your job: identify ONE specific, small, immediately doable first action — something they can do in the next 2 minutes.
Then list 3-5 follow-up steps.

Respond ONLY with valid JSON:
{
  "firstAction": "One concrete sentence starting with a verb. Specific. Small. Right now.",
  "steps": ["Step 1", "Step 2", "Step 3"]
}

Rules:
- firstAction must start with a verb (Open, Write, Find, Pick up, etc.)
- firstAction must be completable in under 2 minutes
- No clinical language, no urgency, no pressure
- Steps should be small and sequential`;

export async function decompose(
  taskTitle: string,
  context?: string,
): Promise<DecompositionResult> {
  const complexity = scoreComplexity(taskTitle);

  // Simple tasks: rule engine is fast and reliable enough
  if (complexity <= 2 || !isLoaded()) {
    const result = getRuleEngineAction(taskTitle);
    return { ...result, source: "rule_engine" };
  }

  try {
    const result = await generate(
      [
        { role: "user", content: DECOMPOSE_PROMPT(taskTitle, context) },
      ],
      { maxTokens: 512, temperature: 0.4 },
    );

    const parsed = JSON.parse(result.text.trim());
    if (parsed.firstAction && Array.isArray(parsed.steps)) {
      return {
        firstAction: parsed.firstAction,
        steps: parsed.steps,
        source: "llm",
      };
    }
    throw new Error("Invalid LLM response shape");
  } catch {
    // Fallback to rule engine on any LLM failure
    const result = getRuleEngineAction(taskTitle);
    return { ...result, source: "rule_engine" };
  }
}
