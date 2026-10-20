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
