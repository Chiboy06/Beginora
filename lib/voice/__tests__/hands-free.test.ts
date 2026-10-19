import { greeting, interpretVoice, shouldStopForAppState, toSpeech } from "../hands-free";

describe("interpretVoice", () => {
  test("yes and no confirm or decline only when an action is waiting", () => {
    expect(interpretVoice("Yes please", true)).toEqual({ kind: "confirm", approved: true });
    expect(interpretVoice("go ahead.", true)).toEqual({ kind: "confirm", approved: true });
    expect(interpretVoice("No, cancel that", true)).toEqual({ kind: "confirm", approved: false });
    expect(interpretVoice("don't send it", true)).toEqual({ kind: "confirm", approved: false });
  });

  test("with nothing waiting, yes is just a message", () => {
    expect(interpretVoice("yes I need help with my essay", false)).toEqual({ kind: "message", text: "yes I need help with my essay" });
  });

  test("stop phrases end hands-free mode", () => {
    for (const phrase of ["stop", "Goodbye.", "that's all", "stop listening"]) {
      expect(interpretVoice(phrase, false)).toEqual({ kind: "stop" });
    }
  });

  test("a sentence that merely contains stop is a message", () => {
    expect(interpretVoice("help me stop procrastinating on my essay", false).kind).toBe("message");
  });

  test("anything else becomes the chat message, without trailing punctuation", () => {
    expect(interpretVoice("Set a reminder for 2 pm!", false)).toEqual({ kind: "message", text: "Set a reminder for 2 pm" });
  });
});

describe("greeting", () => {
  test("uses the time of day and the user's name", () => {
    expect(greeting("Chi", 9)).toBe("Good morning, Chi. I'm Beginora. What would you like to start?");
    expect(greeting("Chi", 14)).toMatch(/^Good afternoon, Chi\./);
    expect(greeting("Chi", 20)).toMatch(/^Good evening, Chi\./);
  });

  test("works without a name", () => {
    expect(greeting(undefined, 9)).toBe("Good morning. I'm Beginora. What would you like to start?");
    expect(greeting("   ", 9)).toMatch(/^Good morning\./);
  });
});

describe("toSpeech", () => {
  test("drops markdown, code and links so the voice reads plain words", () => {
    expect(toSpeech("**First step:** open [the doc](https://x.y)\n```json\n{}\n```\n# Done")).toBe("First step: open the doc Done");
  });

  test("never reads hidden reasoning", () => {
    expect(toSpeech("<think>long reasoning</think>Open the document.")).toBe("Open the document.");
  });

  test("long replies are cut at a sentence end", () => {
    const text = `${"This is one sentence. ".repeat(40)}`;
    const spoken = toSpeech(text, 100);
    expect(spoken.length).toBeLessThanOrEqual(100);
    expect(spoken.endsWith(".")).toBe(true);
  });
});

describe("voice navigation", () => {
  test("open/show/go to a screen name opens that screen", () => {
    expect(interpretVoice("Open settings", false)).toEqual({ kind: "open", route: "/settings", label: "Settings" });
    expect(interpretVoice("show me my tasks.", false)).toMatchObject({ route: "/tasks" });
    expect(interpretVoice("go to the calendar", false)).toMatchObject({ route: "/calendar" });
    expect(interpretVoice("take me to permissions", false)).toMatchObject({ route: "/connectors" });
    expect(interpretVoice("open models", false)).toMatchObject({ route: "/models" });
    expect(interpretVoice("add a task", false).kind).toBe("message");
    expect(interpretVoice("open new task", false)).toMatchObject({ route: "/task/new" });
  });

  test("go back is navigation, even while an action is waiting", () => {
    expect(interpretVoice("go back", true)).toEqual({ kind: "open", route: "back", label: "back" });
  });

  test("open followed by something that is not a screen goes to the model", () => {
    expect(interpretVoice("open the document for my essay", false).kind).toBe("message");
  });
});

describe("shouldStopForAppState", () => {
  test("the recognizer's own screen does not end hands-free", () => {
    expect(shouldStopForAppState("background", true)).toBe(false);
  });

  test("really leaving the app does", () => {
    expect(shouldStopForAppState("background", false)).toBe(true);
    expect(shouldStopForAppState("inactive", false)).toBe(true);
    expect(shouldStopForAppState("active", false)).toBe(false);
  });
});
