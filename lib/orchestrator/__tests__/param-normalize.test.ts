// Regression test for the on-device failure found in the Fase 4 spot checks:
// "che appuntamenti ho domani" routed correctly to get_calendar_events but the
// model emitted date "2026-07-02T00:00:00" (the prompt's general datetime
// format) where the tool schema wants bare YYYY-MM-DD, and validation rejected
// the call with "Invalid parameters". Date-formatted params must be truncated,
// not rejected, when they arrive as a full ISO datetime.

// tool-dispatcher transitively imports the embedding engine via
// document-retriever; mock that away so the real dispatcher module loads.
jest.mock("../../store/task-store", () => ({ useTaskStore: { getState: () => ({ createTaskWithPlan: jest.fn() }) } }));
jest.mock("../document-retriever", () => ({
  queryDocuments: jest.fn(),
}));
jest.mock("../../native/system-actions", () => ({}));
jest.mock("../../native/reminders", () => ({}));
jest.mock("../../native/contacts", () => ({}));
jest.mock("../../native/communication", () => ({}));
jest.mock("../../native/calendar", () => ({}));

import { normalizeToolParams } from "../tool-dispatcher";

describe("normalizeToolParams", () => {
  test("truncates a full ISO datetime to YYYY-MM-DD for date-formatted params", () => {
    const out = normalizeToolParams("get_calendar_events", {
      date: "2026-07-02T00:00:00",
    });
    expect(out.date).toBe("2026-07-02");
  });

  test("also covers set_alarm's optional date param", () => {
    const out = normalizeToolParams("set_alarm", {
      time: "07:30",
      date: "2026-07-02T07:30:00",
    });
    expect(out.date).toBe("2026-07-02");
    expect(out.time).toBe("07:30"); // untouched
  });

  test("leaves bare dates, datetimes on ISO8601 params, and junk alone", () => {
    expect(
      normalizeToolParams("get_calendar_events", { date: "2026-07-02" }).date,
    ).toBe("2026-07-02");
    // create_event.start is ISO8601: a full datetime is the CORRECT shape.
    expect(
      normalizeToolParams("create_event", {
        title: "x",
        start: "2026-07-02T15:00:00",
      }).start,
    ).toBe("2026-07-02T15:00:00");
    // Invalid leading date → not a truncation candidate; validator will report it.
    expect(
      normalizeToolParams("get_calendar_events", { date: "2026-02-30T00:00:00" })
        .date,
    ).toBe("2026-02-30T00:00:00");
    expect(
      normalizeToolParams("unknown_tool", { date: "2026-07-02T00:00:00" }).date,
    ).toBe("2026-07-02T00:00:00");
  });
});

describe("small-model parameter repairs", () => {
  const { checkToolParams } = jest.requireActual("../tool-dispatcher");

  test("a zone label after the time is dropped so the date parses", () => {
    expect(normalizeToolParams("set_reminder", { text: "Call Mum", datetime: "2026-10-20T18:00 (Africa/Lagos)" }))
      .toEqual({ text: "Call Mum", datetime: "2026-10-20T18:00:00" });
    expect(checkToolParams("create_event", { title: "x", start: "2026-10-20T16:00 (Africa/Lagos)" }).error).toBeNull();
  });

  test("an alarm time given as a datetime becomes HH:MM plus its date", () => {
    expect(normalizeToolParams("set_alarm", { time: "2026-10-21T07:00" })).toEqual({ time: "07:00", date: "2026-10-21" });
    expect(checkToolParams("set_alarm", { time: "2026-10-21T7:05:00" }).error).toBeNull();
  });

  test("an alarm with an explicit date keeps that date", () => {
    expect(normalizeToolParams("set_alarm", { time: "2026-10-21T07:00", date: "2026-10-22" })).toEqual({ time: "07:00", date: "2026-10-22" });
  });

  test("the calendar-instruction wording is removed from event titles", () => {
    expect(normalizeToolParams("create_event", { title: "Add I am Batman to my calendar", start: "2026-10-20T16:00" }).title).toBe("I am Batman");
    expect(normalizeToolParams("create_event", { title: "Dentist", start: "2026-10-20T16:00" }).title).toBe("Dentist");
  });

  test("unrepairable values still fail validation", () => {
    expect(checkToolParams("set_reminder", { text: "x", datetime: "tomorrow evening" }).error).toMatch(/datetime/);
  });
});
