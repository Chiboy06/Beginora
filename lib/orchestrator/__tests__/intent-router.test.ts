import { routeIntent } from "../intent-router";

test.each([
  ["add I am Batman to my calendar, I will be taking my task in the next 1 hour", "create_event"],
  ["put a dentist appointment on Friday at 10", "create_event"],
  ["what's on my calendar tomorrow?", "get_calendar_events"],
  ["show me my schedule for today", "get_calendar_events"],
  ["do I have any meetings tomorrow", "get_calendar_events"],
  ["set an alarm for 7am tomorrow", "set_alarm"],
  ["wake me up at 6", "set_alarm"],
  ["set a timer for 5 minutes", "set_timer"],
  ["remind me at 6pm to call mum", "set_reminder"],
  ["text Mum that I'm running late", "send_sms"],
  ["Text Mum at 18:00 that I'm on my way", "schedule_sms"],
  ["send a message to Ada tomorrow saying happy birthday", "schedule_sms"],
  ["call Ada", "make_call"],
  ["save a note: buy bread and call Ada", "save_note"],
  ["draft an email to my lecturer about the deadline", "draft_email"],
  ["send this to my telegram: buy bread", "send_telegram"],
  ["I need to start my essay but I keep avoiding it", "break_down_task"],
  ["I'm stuck on my report", "break_down_task"],
])("%s -> %s", (said, tool) => {
  expect(routeIntent(said)).toBe(tool);
});

test.each([
  "hi",
  "how are you?",
  "what is the capital of France",
  "thanks, that helped",
  "tell me a joke",
])("conversation is left to the model: %s", (said) => {
  expect(routeIntent(said)).toBeNull();
});

describe("times from the clock", () => {
  const { relativeTime, dateFromText, localDateTime } = jest.requireActual("../intent-router");
  const NOW = new Date(2026, 9, 20, 15, 10); // Tue 20 Oct 2026, 15:10

  test.each([
    ["I will be taking my task in the next 1 hour", "2026-10-20T16:10:00"],
    ["remind me in 20 minutes", "2026-10-20T15:30:00"],
    ["in an hour", "2026-10-20T16:10:00"],
    ["in half an hour", "2026-10-20T15:40:00"],
    ["in two hours", "2026-10-20T17:10:00"],
    ["in 5 mins", "2026-10-20T15:15:00"],
  ])("%s", (said, expected) => {
    expect(localDateTime(relativeTime(said, NOW))).toBe(expected);
  });

  test("no relative time means null", () => {
    expect(relativeTime("at 6pm", NOW)).toBeNull();
  });

  test.each([
    ["what's on my calendar?", "2026-10-20"],
    ["what's on my calendar tomorrow?", "2026-10-21"],
    ["any meetings the day after tomorrow", "2026-10-22"],
    ["show my schedule for Friday", "2026-10-23"],
    ["what do I have on Tuesday", "2026-10-20"],
    ["what do I have on Monday", "2026-10-26"],
  ])("%s -> %s", (said, expected) => {
    expect(dateFromText(said, NOW)).toBe(expected);
  });
});

test.each([
  ["add a task: finish my essay", "add_task"],
  ["create a new task called revise chapter 3", "add_task"],
  ["add I am Batman to my calendar", "create_event"],
])("task vs calendar: %s -> %s", (said, tool) => {
  expect(routeIntent(said)).toBe(tool);
});

test.each([
  "how much screen time today?",
  "show my app usage",
  "how long have I been on TikTok today",
])("screen time: %s", (said) => {
  expect(routeIntent(said)).toBe("get_screen_time");
});

describe("mentionsTime", () => {
  const { mentionsTime } = jest.requireActual("../intent-router");
  test.each(["remind me at 6pm", "what's on tomorrow", "meet at 14:30", "in 20 minutes", "this week"])("time: %s", (said) => {
    expect(mentionsTime(said)).toBe(true);
  });
  test.each(["which day does Nigeria celebrate Independence", "how many states does Nigeria have", "define photosynthesis"])("not time: %s", (said) => {
    expect(mentionsTime(said)).toBe(false);
  });
});
