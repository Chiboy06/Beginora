jest.mock("../../llm/llm-engine", () => ({ isLoaded: () => false, generate: jest.fn() }));

import { smallTalkReply } from "../small-talk";

test.each(["hi", "Hello!", "hey there", "good morning", "hi beginora"])("greeting: %s", (said) => {
  expect(smallTalkReply(said, "Chi", 0)).toMatch(/Chi/);
});

test.each(["how are you?", "hi, how are you", "how's it going"])("how are you: %s", (said) => {
  expect(smallTalkReply(said, "", 0)).toMatch(/^I'm doing well|^All good/);
});

test.each(["thanks", "Thank you so much!", "ok thanks"])("thanks: %s", (said) => {
  expect(smallTalkReply(said, "", 0)).toMatch(/welcome|Anytime/);
});

test("what can you do lists the real features", () => {
  expect(smallTalkReply("what can you help me with?", "", 0)).toMatch(/first step.*alarms/);
});

test.each(["I feel overwhelmed today", "I'm so stressed", "i am feeling really tired right now"])("feelings get support, not a task plan: %s", (said) => {
  expect(smallTalkReply(said, "", 0)).toMatch(/one thing/);
});

test("consecutive replies to the same kind of message differ", () => {
  expect(smallTalkReply("hi", "", 0)).not.toBe(smallTalkReply("hi", "", 1));
});

test("crisis wording gets the reviewed safety reply", () => {
  expect(smallTalkReply("I want to end my life", "Chi", 0)).toMatch(/reach out to someone you trust/);
});

test.each([
  "hi, can you set an alarm for 7",
  "I feel overwhelmed by my thesis due Friday",
  "thanks, now remind me at 6pm",
  "I have ADHD and need to start my essay",
])("anything with a real request goes on to the model: %s", (said) => {
  expect(smallTalkReply(said, "", 0)).toBeNull();
});

describe("dateTimeReply", () => {
  const { dateTimeReply } = jest.requireActual("../small-talk");
  const NOW = new Date(2026, 9, 20, 12, 40); // Tue 20 Oct 2026, 12:40

  test.each([
    ["What was yesterday's date", "Yesterday was Monday, 19 October 2026."],
    ["What was yesterday date?", "Yesterday was Monday, 19 October 2026."],
    ["what's today's date", "Today is Tuesday, 20 October 2026."],
    ["what is the date", "Today is Tuesday, 20 October 2026."],
    ["what day is it", "Today is Tuesday, 20 October 2026."],
    ["what will be tomorrow's date", "Tomorrow is Wednesday, 21 October 2026."],
    ["what time is it?", "It's 12:40."],
  ])("%s", (said, expected) => {
    expect(dateTimeReply(said, NOW)).toBe(expected);
  });

  test.each([
    "which day does Nigeria celebrate Independence",
    "what day is my exam",
    "how many states does Nigeria have",
    "set an alarm for tomorrow",
  ])("not a clock question: %s", (said) => {
    expect(dateTimeReply(said, NOW)).toBeNull();
  });
});
