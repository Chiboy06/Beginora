export interface ValidatedPlan {
  firstAction: string;
  steps: string[];
}

const MAX_ACTION_LENGTH = 180;
const MAX_STEP_LENGTH = 180;

/**
 * Validate only the small contract the task UI renders. Extra model fields are
 * intentionally ignored; raw model output is never passed to the screen.
 */
export function validatePlan(value: unknown): ValidatedPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.firstAction !== "string") return null;
  const firstAction = candidate.firstAction.trim();
  if (!firstAction || firstAction.length > MAX_ACTION_LENGTH) return null;

  if (!Array.isArray(candidate.steps) || candidate.steps.length < 3 || candidate.steps.length > 5) {
    return null;
  }

  const steps: string[] = [];
  for (const step of candidate.steps) {
    if (typeof step !== "string") return null;
    const cleanStep = step.trim();
    if (!cleanStep || cleanStep.length > MAX_STEP_LENGTH) return null;
    steps.push(cleanStep);
  }

  return { firstAction, steps };
}
