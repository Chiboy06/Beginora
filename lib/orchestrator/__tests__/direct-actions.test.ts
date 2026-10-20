import { directAction, parseClock } from "../direct-actions";
import { localDateTime } from "../intent-router";

const NOW = new Date(2026, 9, 20, 15, 10); // Tue 20 Oct 2026, 15:10

describe("parseClock", () => {
  test.each([
    ["set an alarm for 7 o'clock today", "2026-10-20T19:00:00"],
    ["at 7am", "2026-10-21T07:00:00"],
    ["5 a.m. tomorrow", "2026-10-21T05:00:00"],
    ["at 18:00", "2026-10-20T18:00:00"],
    ["at 7:30 pm", "2026-10-20T19:30:00"],
    ["at 6pm", "2026-10-20T18:00:00"],
    ["at noon tomorrow", "2026-10-21T12:00:00"],
    ["at 9", "2026-10-20T21:00:00"],
    ["tomorrow at 7", "2026-10-21T07:00:00"],
    ["at 3pm", "2026-10-21T15:00:00"],
  ])("%s -> %s", (said, expected) => {
    expect(localDateTime(parseClock(said, NOW) as Date)).toBe(expected);
  });

  test("a bare number that is not a time is ignored", () => {
    expect(parseClock("I have 3 essays", NOW)).toBeNull();
    expect(parseClock("set a timer for 5 minutes", NOW)).toBeNull();
  });
});

describe("directAction", () => {
  test("alarm: 'set an alarm for 7 o'clock today'", () => {
    expect(directAction("set_alarm", "set an alarm for 7 o'clock today", NOW)).toEqual({
      tool: "set_alarm", parameters: { time: "19:00", date: "2026-10-20" },
    });
  });

  test("alarm: 'wake me up at 5 a.m. tomorrow'", () => {
    expect(directAction("set_alarm", "wake me up at 5 a.m. tomorrow", NOW)?.parameters).toEqual({ time: "05:00", date: "2026-10-21" });
  });

  test("timer in minutes, hours and seconds", () => {
    expect(directAction("set_timer", "set a timer for 5 minutes", NOW)?.parameters).toEqual({ minutes: 5 });
    expect(directAction("set_timer", "timer 2 hours", NOW)?.parameters).toEqual({ minutes: 120 });
    expect(directAction("set_timer", "timer for 90 seconds", NOW)?.parameters).toEqual({ minutes: 2 });
  });

  test("reminder with what to do", () => {
    expect(directAction("set_reminder", "remind me at 6pm to call mum", NOW)?.parameters).toEqual({ text: "call mum", datetime: "2026-10-20T18:00:00" });
    expect(directAction("set_reminder", "remind me in 20 minutes to drink water", NOW)?.parameters).toEqual({ text: "drink water", datetime: "2026-10-20T15:30:00" });
  });

  test("reminder without a subject still works", () => {
    expect(directAction("set_reminder", "Set a reminder for 5 a.m. tomorrow", NOW)?.parameters).toEqual({ text: "Reminder", datetime: "2026-10-21T05:00:00" });
  });

  test("texts now and later", () => {
    expect(directAction("send_sms", "text Mum that I'm running late", NOW)?.parameters).toEqual({ contact: "Mum", text: "I'm running late" });
    expect(directAction("schedule_sms", "Text Mum at 18:00 that I'm on my way", NOW)?.parameters).toEqual({
      contact: "Mum", text: "I'm on my way", datetime: "2026-10-20T18:00:00",
    });
  });

  test("unclear words fall back to the model", () => {
    expect(directAction("set_alarm", "set an alarm", NOW)).toBeNull();
    expect(directAction("set_reminder", "remind me about the essay", NOW)).toBeNull();
    expect(directAction("send_sms", "text Mum", NOW)).toBeNull();
    expect(directAction("create_event", "add Batman to my calendar", NOW)).toBeNull();
  });
});

describe("add_task", () => {
  test.each([
    ["add a task: finish my essay", "finish my essay"],
    ["Add task to call the landlord", "call the landlord"],
    ["create a new task called revise chapter 3", "revise chapter 3"],
    ["new task clean my room", "clean my room"],
  ])("%s", (said, title) => {
    expect(directAction("add_task", said, NOW)).toEqual({ tool: "add_task", parameters: { title } });
  });

  test("no task text means the model or a question takes over", () => {
    expect(directAction("add_task", "add a task", NOW)).toBeNull();
  });
});

describe("reminders and tasks with a time", () => {
  test("'remind me to call Dr. Ben by 12 a.m.' notifies at midnight", () => {
    expect(directAction("set_reminder", "remind me to call Dr. Ben by 12 a.m.", NOW)?.parameters).toEqual({
      text: "call Dr. Ben", datetime: "2026-10-21T00:00:00",
    });
  });

  test("a task with a time gets a reminder at that time", () => {
    expect(directAction("add_task", "add a task to finish my essay by 6pm", NOW)?.parameters).toEqual({
      title: "finish my essay", remindAt: "2026-10-20T18:00:00",
    });
  });

  test("a task without a time has no reminder", () => {
    expect(directAction("add_task", "add a task to finish my essay", NOW)?.parameters).toEqual({ title: "finish my essay" });
  });
});

describe("drafting a text for someone", () => {
  test("'type an SMS message for Daniel Phantom' opens a text to Daniel Phantom", () => {
    expect(directAction("send_sms", "another thing I want you to do is type an SMS message for Daniel Phantom", NOW)?.parameters).toEqual({ contact: "Daniel Phantom", text: "" });
  });

  test("with a message, it is filled in", () => {
    expect(directAction("send_sms", "write a text to Ada saying I'll be late", NOW)?.parameters).toEqual({ contact: "Ada", text: "I'll be late" });
  });

  test("with a time, it becomes a scheduled text", () => {
    expect(directAction("schedule_sms", "draft a message for Ada saying happy birthday at 9am", NOW)?.parameters).toEqual({
      contact: "Ada", text: "happy birthday", datetime: "2026-10-21T09:00:00",
    });
  });
});
