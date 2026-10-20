import { isDrift, summarizeUsage, type AppEvent } from "../usage-signals";

const MIN = 60 * 1000;
const NOW = 1_000 * MIN;
const OWN = "app.beginora.android";
const TIKTOK = "com.zhiliaoapp.musically";
const NOTES = "com.google.android.keep";

const on = (packageName: string, minutesAgo: number): AppEvent => ({ packageName, type: "resumed", time: NOW - minutesAgo * MIN });
const off = (packageName: string, minutesAgo: number): AppEvent => ({ packageName, type: "paused", time: NOW - minutesAgo * MIN });

test("no events means no drift", () => {
  const summary = summarizeUsage([], NOW, OWN);
  expect(summary).toEqual({ switches: 0, distractingMinutes: 0 });
  expect(isDrift(summary)).toBe(false);
});

test("a long session in a feed app counts only the minutes inside the window", () => {
  // Opened 50 minutes ago and still open: only the last 30 minutes count.
  const summary = summarizeUsage([on(TIKTOK, 50)], NOW, OWN);
  expect(summary.distractingMinutes).toBe(30);
  expect(isDrift(summary)).toBe(true);
});

test("a paused session stops counting at the pause", () => {
  expect(summarizeUsage([on(TIKTOK, 25), off(TIKTOK, 15)], NOW, OWN).distractingMinutes).toBe(10);
});

test("time in non-distracting apps and in Beginora is ignored", () => {
  expect(summarizeUsage([on(NOTES, 30), on(OWN, 20)], NOW, OWN).distractingMinutes).toBe(0);
});

test("rapid app switching is drift even without feed apps", () => {
  const events: AppEvent[] = [];
  for (let i = 0; i < 16; i += 1) events.push(on(i % 2 ? NOTES : OWN, 9 - i * 0.5));
  const summary = summarizeUsage(events, NOW, OWN);
  expect(summary.switches).toBe(15);
  expect(isDrift(summary)).toBe(true);
});

test("switches before the 10-minute window are not counted", () => {
  const events = [on(NOTES, 25), on(OWN, 20), on(NOTES, 15), on(OWN, 5)];
  expect(summarizeUsage(events, NOW, OWN).switches).toBe(1);
});

test("repeated resumes of the same app are one session", () => {
  expect(summarizeUsage([on(TIKTOK, 8), on(TIKTOK, 6), on(TIKTOK, 4)], NOW, OWN)).toEqual({ switches: 0, distractingMinutes: 8 });
});

test("events arriving out of order are sorted first", () => {
  expect(summarizeUsage([on(NOTES, 5), on(TIKTOK, 20)], NOW, OWN).distractingMinutes).toBe(15);
});

describe("screenTime", () => {
  const { screenTime, appName } = jest.requireActual("../usage-signals");

  test("totals minutes per app since midnight, most used first, with friendly names", () => {
    const midnight = NOW - 300 * MIN;
    const events = [on(TIKTOK, 400), off(TIKTOK, 280), on(NOTES, 60), off(NOTES, 30), on("com.whatsapp", 20)];
    expect(screenTime(events, midnight, NOW)).toEqual([
      { app: "Keep", minutes: 30 },
      { app: "TikTok", minutes: 20 },
      { app: "WhatsApp", minutes: 20 },
    ]);
  });

  test("unknown packages show their last part", () => {
    expect(appName("com.example.studyplanner")).toBe("Studyplanner");
  });
});
