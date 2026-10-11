import { FOCUS_DURATION_SECONDS, formatFocusTime, getRemainingSeconds } from "../focus-timer";

describe("focus timer helpers", () => {
  it("starts with a five-minute session", () => {
    expect(FOCUS_DURATION_SECONDS).toBe(300);
    expect(formatFocusTime(FOCUS_DURATION_SECONDS)).toBe("05:00");
  });

  it("rounds a partial second up so the display does not skip a remaining second", () => {
    expect(getRemainingSeconds(2_500, 1_501)).toBe(1);
    expect(getRemainingSeconds(2_501, 1_500)).toBe(2);
  });

  it("never returns negative time after the deadline", () => {
    expect(getRemainingSeconds(1_000, 1_001)).toBe(0);
    expect(formatFocusTime(-30)).toBe("00:00");
  });

  it("formats durations longer than an hour without truncating minutes", () => {
    expect(formatFocusTime(3_661)).toBe("61:01");
  });
});
