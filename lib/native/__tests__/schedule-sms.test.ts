jest.mock("react-native", () => ({
  Linking: { openURL: jest.fn() },
  Share: { share: jest.fn(), sharedAction: "sharedAction", dismissedAction: "dismissedAction" },
}));
jest.mock("../contacts", () => ({ resolveContactNumber: jest.fn() }));
jest.mock("../reminders", () => ({ scheduleLocalReminder: jest.fn() }));

import { resolveContactNumber } from "../contacts";
import { scheduleLocalReminder } from "../reminders";
import { saveNote, scheduleSms, smsUrl } from "../communication";

const WHEN = "2026-10-20T18:00:00";

beforeEach(() => {
  jest.clearAllMocks();
  (resolveContactNumber as jest.Mock).mockResolvedValue({ ok: true, name: "Mum", number: "+2348012345678" });
  (scheduleLocalReminder as jest.Mock).mockResolvedValue({ success: true, message: "ok", identifier: "n1" });
});

test("the SMS link fills the recipient and encodes the text", () => {
  expect(smsUrl("+2348012345678", "Running late & sorry?")).toBe("sms:+2348012345678?body=Running%20late%20%26%20sorry%3F");
});

test("schedules a notification that carries the number and text to open later", async () => {
  const result = await scheduleSms("Mum", "I'm running late", WHEN, "en");

  expect(result.success).toBe(true);
  expect(result.message).toContain("Mum");
  expect(scheduleLocalReminder).toHaveBeenCalledWith(
    expect.stringContaining("I'm running late"),
    WHEN,
    null,
    { kind: "sms", to: "+2348012345678", body: "I'm running late" },
  );
});

test("an unknown contact is reported and nothing is scheduled", async () => {
  (resolveContactNumber as jest.Mock).mockResolvedValue({ ok: false, reason: "not_found" });
  const result = await scheduleSms("Nobody", "hi", WHEN, "en");
  expect(result).toMatchObject({ success: false, message: expect.stringContaining("Nobody") });
  expect(scheduleLocalReminder).not.toHaveBeenCalled();
});

test("missing contacts permission is explained, not reported as a missing contact", async () => {
  (resolveContactNumber as jest.Mock).mockResolvedValue({ ok: false, reason: "permission" });
  expect((await scheduleSms("Mum", "hi", WHEN, "en")).message).toMatch(/permission/);
});

test("a reminder that can't be scheduled (e.g. a past time) passes its reason through", async () => {
  (scheduleLocalReminder as jest.Mock).mockResolvedValue({ success: false, message: "That reminder time has already passed." });
  expect(await scheduleSms("Mum", "hi", WHEN, "en")).toEqual({ success: false, message: "That reminder time has already passed.", error: "not scheduled" });
});

describe("saveNote", () => {
  const { Share } = jest.requireMock("react-native") as { Share: { share: jest.Mock; sharedAction: string; dismissedAction: string } };

  test("opens the share sheet with the note text", async () => {
    Share.share.mockResolvedValue({ action: Share.sharedAction });
    expect(await saveNote("buy bread", "en")).toEqual({ success: true, message: "Note shared." });
    expect(Share.share).toHaveBeenCalledWith({ message: "buy bread" });
  });

  test("closing the sheet is not reported as saved", async () => {
    Share.share.mockResolvedValue({ action: Share.dismissedAction });
    expect(await saveNote("buy bread", "en")).toEqual({ success: false, message: "No note was saved." });
  });
});
