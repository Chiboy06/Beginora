// Instant replies for greetings, thanks, "what can you do" and feelings. Small
// on-device models loop or copy earlier replies on exactly these turns (seen
// with qwen3:0.6b); answering them in code is instant and never repeats.

import { CRISIS_REPLY, isCrisis } from "../ai/decomposer";

type Kind = "greeting" | "how_are_you" | "thanks" | "capabilities" | "feeling";

const PATTERNS: { kind: Kind; test: RegExp }[] = [
  { kind: "how_are_you", test: /^(hi|hey|hello)?[,!\s]*(how are you|how're you|how are u|how is it going|how's it going|how do you do)\b/i },
  { kind: "greeting", test: /^(hi|hey|hello|hiya|good (morning|afternoon|evening)|yo)( there)?( beginora)?[!.\s]*$/i },
  { kind: "thanks", test: /^(thanks|thank you|thank u|thx|cheers|great,? thanks|ok(ay)? thanks?)( so much| a lot)?( beginora)?[!.\s]*$/i },
  { kind: "capabilities", test: /\b(what can you (do|help( me)? with)|how can you help|what do you do|help me use (this|you))\b/i },
  { kind: "feeling", test: /^(i\s*(feel|'?m feeling|am feeling|'?m|am)\s+(so |really |very |a bit |kind of )?(overwhelmed|stressed|anxious|tired|exhausted|lost|unmotivated|lazy|down|bad))[!.\s]*(today|right now|now)?[!.\s]*$/i },
];

const REPLIES: Record<Kind, ((name: string) => string)[]> = {
  greeting: [
    (n) => `Hi${n}! What would you like to get started on?`,
    (n) => `Hello${n}. Is there one thing you'd like to begin today?`,
    (n) => `Hey${n}! Tell me a task and I'll find a small first step.`,
  ],
  how_are_you: [
    (n) => `I'm doing well, thanks for asking${n}. How are you feeling about your tasks today?`,
    (n) => `All good here${n}. Is there something you've been meaning to start?`,
  ],
  thanks: [
    (n) => `You're welcome${n}. I'm here when you're ready for the next step.`,
    (n) => `Anytime${n}. Small steps still count.`,
  ],
  capabilities: [
    () =>
      "I help you start things. Tell me a task and I'll give you one small first step. I can also set alarms, timers and reminders, add calendar events, prepare texts and emails for you to send, save notes, and check in gently if a task gets stuck.",
  ],
  feeling: [
    (n) => `That sounds like a lot${n}. You don't have to do everything now. Want to pick one thing? Tell me the task and I'll find a tiny first step.`,
    (n) => `Thanks for telling me${n}. Let's keep it small: what's one thing on your mind that you'd like to start?`,
  ],
};

// turn: how many replies came before, so consecutive answers vary.
export function smallTalkReply(text: string, name: string, turn: number): string | null {
  const said = text.trim();
  if (isCrisis(said)) return CRISIS_REPLY;
  const match = PATTERNS.find((p) => p.test.test(said));
  if (!match) return null;
  const options = REPLIES[match.kind];
  return options[turn % options.length](name ? `, ${name}` : "");
}
