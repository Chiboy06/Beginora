// Deterministic rule engine for task decomposition.
// Used as fallback when LLM is unavailable or on low-RAM devices.
// Returns a specific, small, immediately doable first action.

interface Rule {
  keywords: string[];
  firstAction: string;
  steps: string[];
}

const RULES: Rule[] = [
  {
    keywords: ["write", "essay", "report", "paper", "thesis", "article", "draft"],
    firstAction: "Open a blank document and write just the title.",
    steps: ["Write the title", "Write one sentence about the main point", "List 3 key ideas", "Expand each idea into a paragraph"],
  },
  {
    keywords: ["email", "message", "reply", "respond", "send"],
    firstAction: "Open your email app and start a new draft.",
    steps: ["Open email app", "Write the subject line", "Write one sentence greeting", "State your main point", "Send"],
  },
  {
    keywords: ["clean", "tidy", "organize", "declutter", "sort"],
    firstAction: "Pick up just 5 things and put them where they belong.",
    steps: ["Clear one surface", "Sort items into keep/donate/trash", "Put away keep items", "Dispose of trash/donate pile"],
  },
  {
    keywords: ["call", "phone", "contact", "reach out"],
    firstAction: "Find the person's number and open the phone app.",
    steps: ["Find the contact", "Decide what you want to say in one sentence", "Make the call"],
  },
  {
    keywords: ["exercise", "workout", "gym", "run", "walk"],
    firstAction: "Put on your workout clothes right now.",
    steps: ["Put on workout clothes", "Get your gear ready", "Start with 5 minutes", "Continue at your own pace"],
  },
  {
    keywords: ["read", "book", "article", "study", "learn"],
    firstAction: "Open the book or article to where you left off.",
    steps: ["Find the material", "Read just one page or section", "Note one thing you learned", "Set a time for the next session"],
  },
  {
    keywords: ["pay", "bill", "invoice", "tax", "finance", "budget"],
    firstAction: "Open your banking app or find the bill.",
    steps: ["Locate the bill or account", "Check the amount due", "Set up the payment", "Confirm and save the receipt"],
  },
  {
    keywords: ["plan", "schedule", "calendar", "appointment", "meeting"],
    firstAction: "Open your calendar and find a free slot.",
    steps: ["Open calendar", "Identify a suitable time", "Block the time", "Set a reminder"],
  },
  {
    keywords: ["cook", "meal", "recipe", "food", "dinner", "lunch"],
    firstAction: "Check what ingredients you already have.",
    steps: ["Check pantry/fridge", "Choose a simple recipe", "Gather ingredients", "Start with the first step of the recipe"],
  },
  {
    keywords: ["apply", "job", "resume", "cv", "application"],
    firstAction: "Open your resume and read through it once.",
    steps: ["Review your resume", "Update one section", "Find one job posting", "Tailor your resume for it", "Submit"],
  },
];

const GENERIC_STEPS = [
  "Write down exactly what needs to happen",
  "Identify the very first physical action",
  "Do just that one action",
  "Decide on the next step after",
];

export function scoreComplexity(title: string): number {
  const words = title.toLowerCase().split(/\s+/);
  let score = 0;
  if (words.length > 5) score += 2;
  if (words.length > 10) score += 2;
  const complexWords = ["project", "entire", "whole", "complete", "finish", "all", "everything", "major"];
  if (complexWords.some((w) => title.toLowerCase().includes(w))) score += 3;
  return Math.min(score, 10);
}

export function getRuleEngineAction(taskTitle: string): { firstAction: string; steps: string[] } {
  const lower = taskTitle.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { firstAction: rule.firstAction, steps: rule.steps };
    }
  }
  // Generic fallback
  return {
    firstAction: `Start by writing down exactly what "${taskTitle}" means to you in one sentence.`,
    steps: GENERIC_STEPS,
  };
}
