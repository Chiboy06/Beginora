import { greeting, interpretVoice, toSpeech } from "../hands-free";

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
