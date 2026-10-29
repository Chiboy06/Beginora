jest.mock("../../llm/llm-engine", () => ({ isLoaded: () => false, generate: jest.fn() }));

import { continueFollowUp, moodFromWords, startFollowUp, type FollowUp, type Turn } from "../followup";

const NOW = new Date(2026, 9, 19, 9, 0); // Monday 19 Oct 2026, 09:00
const ctx = { dailyCheckInSet: false };

// Plays a conversation and returns every turn.
function talk(...said: string[]): Turn[] {
  const turns: Turn[] = [];
  let pending: FollowUp | null = null;
  for (const s of said) {
    const turn: Turn | null = pending ? continueFollowUp(pending, s, NOW, ctx) : startFollowUp(s, NOW, ctx);
    if (!turn) throw new Error(`no turn for "${s}"`);
    turns.push(turn);
    pending = turn.next;
  }
  return turns;
}

describe("tasks by voice or text", () => {
  test("'set me a task' asks what, when, reminder and details, then saves", () => {
    const t = talk("Set me a task", "write my essay intro", "tomorrow at 5pm", "yes", "use my notes from class");
    expect(t[0].reply).toMatch(/What's the task/);
    expect(t[1].reply).toMatch(/When should it be done/);
    expect(t[2].reply).toMatch(/remind you/);
    expect(t[3].reply).toMatch(/details/);
    expect(t[4].next).toBeNull();
    expect(t[4].effect).toEqual({
      type: "create_task",
      title: "Write my essay intro",
      dueAt: new Date(2026, 9, 20, 17, 0).getTime(),
      remind: true,
      notes: "use my notes from class",
    });
  });

  test("a title and time in one go skips to the reminder question", () => {
    const t = talk("add a task to call mum on Friday at 9am", "no", "no");
    expect(t[0].reply).toMatch(/"Call mum"/);
    expect(t[2].effect).toEqual({ type: "create_task", title: "Call mum", dueAt: new Date(2026, 9, 23, 9, 0).getTime(), remind: false, notes: null });
  });

  test("no time goes to Sort later", () => {
    const t = talk("create a task", "buy bread", "no time", "no");
    expect(t[3].effect).toEqual({ type: "create_task", title: "Buy bread", dueAt: null, remind: false, notes: null });
  });

  test("a spoken list is read back and added after a yes", () => {
    const t = talk("add tasks: buy bread, call mum and pay rent on Friday", "yes");
    expect(t[0].reply).toMatch(/I heard 3 tasks/);
    expect(t[1].effect).toEqual({
      type: "create_tasks",
      tasks: [
        { project: null, task: "Buy bread", due: null },
        { project: null, task: "Call mum", due: null },
        { project: null, task: "Pay rent", due: "2026-10-23" },
      ],
    });
  });

  test("cancel at any step saves nothing", () => {
    const t = talk("set me a task", "cancel");
    expect(t[1]).toEqual({ reply: "Okay, cancelled. Nothing was saved.", next: null });
  });

  test("a new request instead of an answer drops the question", () => {
    const first = startFollowUp("set me a task", NOW, ctx)!;
    const asked = continueFollowUp(first.next!, "Water the plants", NOW, ctx)!;
    expect(continueFollowUp(asked.next!, "set me a reminder", NOW, ctx)).toBeNull();
  });
});

describe("reminders", () => {
  test("'set me a reminder' asks what and when", () => {
    const t = talk("set me a reminder", "take my medicine", "at 8pm");
    expect(t[2].effect).toEqual({ type: "create_reminder", text: "take my medicine", at: new Date(2026, 9, 19, 20, 0).getTime() });
  });

  test("a full reminder sentence is left to the existing reminder path", () => {
    expect(startFollowUp("remind me to call mum at 6pm", NOW, ctx)).toBeNull();
  });
});

describe("mood and daily check-in", () => {
  test.each([
    ["I'm feeling happy today", "great"],
    ["I feel so tired", "tired"],
    ["I am stressed", "stressed"],
    ["my day was good", "good"],
    ["I'm not happy", "sad"],
    ["I'm going to the shop", null],
  ])("%s", (said, mood) => {
    expect(moodFromWords(said)).toBe(mood);
  });

  test("a mood is saved, the day is asked about, then when to ask daily", () => {
    const t = talk("I'm feeling happy today", "I finished my project", "at 8 pm");
    expect(t[0].effect).toEqual({ type: "log_mood", mood: "great" });
    expect(t[1].effect).toEqual({ type: "add_mood_note", note: "I finished my project" });
    expect(t[1].reply).toMatch(/When would you like me to ask/);
    expect(t[2].effect).toEqual({ type: "daily_checkin", hour: 20, minute: 0 });
  });

  test("once the daily check-in is set, it is not asked again", () => {
    const first = startFollowUp("I feel calm", NOW, { dailyCheckInSet: true })!;
    const done = continueFollowUp(first.next!, "no", NOW, { dailyCheckInSet: true })!;
    expect(done.next).toBeNull();
  });

  test("ask me how my day was at a time, directly", () => {
    expect(startFollowUp("ask me how my day was at 9pm", NOW, ctx)?.effect).toEqual({ type: "daily_checkin", hour: 21, minute: 0 });
    expect(startFollowUp("stop asking about my day", NOW, ctx)?.effect).toEqual({ type: "daily_checkin_off" });
  });

  test("ordinary questions are not follow-ups", () => {
    expect(startFollowUp("what is the capital of Nigeria?", NOW, ctx)).toBeNull();
    expect(startFollowUp("set an alarm for 7am", NOW, ctx)).toBeNull();
  });
});

describe("open questions never trap the conversation", () => {
  test("a missed answer is asked once more, then the words go through as a new request", () => {
    const asked = startFollowUp("set me a reminder", NOW, ctx)!;
    const what = continueFollowUp(asked.next!, "drink water", NOW, ctx)!;
    const again = continueFollowUp(what.next!, "hmm", NOW, ctx)!;
    expect(again.reply).toMatch(/What time/);
    expect(continueFollowUp(again.next!, "what is the capital of France", NOW, ctx)).toBeNull();
  });

  test("a clear new request drops a time question at once", () => {
    const asked = talk("set me a task", "write the report");
    expect(continueFollowUp(asked[1].next!, "set an alarm for 7am", NOW, ctx)).toBeNull();
  });

  test("'remind me sometime soon' is not a follow-up", () => {
    expect(startFollowUp("remind me sometime soon", NOW, ctx)).toBeNull();
  });
});

describe("a whole schedule in one sentence", () => {
  const evening = new Date(2026, 9, 29, 15, 0);
  test("is read back, and a yes adds each item as a task with a reminder", () => {
    const first = startFollowUp("read by 5, by 6 I'll be going out for jogging, and by 7 I'll be having my dinner", evening, ctx)!;
    expect(first.reply).toMatch(/I heard 3 plans/);
    const yes = continueFollowUp(first.next!, "yes", evening, ctx)!;
    expect(yes.effect).toEqual({
      type: "create_schedule",
      items: [
        { title: "Read", at: new Date(2026, 9, 29, 17, 0).getTime() },
        { title: "Going out for jogging", at: new Date(2026, 9, 29, 18, 0).getTime() },
        { title: "Having my dinner", at: new Date(2026, 9, 29, 19, 0).getTime() },
      ],
    });
  });
});
