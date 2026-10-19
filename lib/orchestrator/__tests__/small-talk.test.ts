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
