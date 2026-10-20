jest.mock("../document-retriever", () => ({ queryDocuments: jest.fn() }));
jest.mock("../../native/system-actions", () => ({}));
jest.mock("../../native/reminders", () => ({ scheduleLocalReminder: jest.fn(async () => ({ success: true, message: "ok", identifier: "n1" })) }));
jest.mock("../../native/contacts", () => ({}));
jest.mock("../../native/communication", () => ({}));
jest.mock("../../native/calendar", () => ({}));
jest.mock("../../ai/decomposer", () => ({ decompose: jest.fn() }));
jest.mock("../../connectors/email-connector", () => ({ openEmailDraft: jest.fn() }));
jest.mock("../../telegram/telegram-service", () => ({ sendTelegramMessage: jest.fn() }));
const mockCreateTaskWithPlan = jest.fn(async (..._args: unknown[]) => ({ id: "t1" }));
const mockSetReminderId = jest.fn(async (..._args: unknown[]) => {});
jest.mock("../../store/task-store", () => ({ useTaskStore: { getState: () => ({ createTaskWithPlan: mockCreateTaskWithPlan, setReminderId: mockSetReminderId }) }, createTaskWithPlan: mockCreateTaskWithPlan }));

import { dispatchToolCall } from "../tool-dispatcher";
import { decompose } from "../../ai/decomposer";

test("break_down_task runs the planner and returns its plan as the reply", async () => {
  (decompose as jest.Mock).mockResolvedValue({
    firstAction: "Open the document",
    steps: ["Write one sentence", "Write a second"],
    source: "llm",
  });

  const result = await dispatchToolCall("break_down_task", { task: "start my essay" }, "en");

  expect(decompose).toHaveBeenCalledWith("start my essay");
  expect(result).toEqual({
    success: true,
    message: "First step: Open the document\n\nThen:\n1. Write one sentence\n2. Write a second",
  });
});

test("a safety response from the planner is passed through unchanged", async () => {
  (decompose as jest.Mock).mockResolvedValue({ firstAction: "Please reach out to someone you trust.", steps: [], source: "safety_block" });
  const result = await dispatchToolCall("break_down_task", { task: "how much medication should I take" }, "en");
  expect(result.message).toBe("Please reach out to someone you trust.");
});

test("schedule_sms needs a contact, text and an ISO time before anything runs", async () => {
  const missing = await dispatchToolCall("schedule_sms", { contact: "Mum", text: "hi" }, "en");
  expect(missing).toMatchObject({ success: false, error: expect.stringContaining("datetime") });

  const badTime = await dispatchToolCall("schedule_sms", { contact: "Mum", text: "hi", datetime: "tomorrow evening" }, "en");
  expect(badTime).toMatchObject({ success: false, error: expect.stringContaining("datetime") });
});

describe("email and Telegram from chat", () => {
  test("draft_email opens the composer with the recipient, subject and body", async () => {
    const email = jest.requireMock("../../connectors/email-connector");
    email.openEmailDraft.mockResolvedValue({ success: true, message: "opened" });
    const result = await dispatchToolCall("draft_email", { to: " ada@example.com ", subject: "Late", body: "Running late" }, "en");
    expect(email.openEmailDraft).toHaveBeenCalledWith({ recipients: ["ada@example.com"], subject: "Late", body: "Running late" });
    expect(result.success).toBe(true);
  });

  test("draft_email without a recipient leaves the To field empty", async () => {
    const email = jest.requireMock("../../connectors/email-connector");
    email.openEmailDraft.mockResolvedValue({ success: true, message: "opened" });
    await dispatchToolCall("draft_email", { subject: "Hi", body: "Hello" }, "en");
    expect(email.openEmailDraft).toHaveBeenLastCalledWith({ recipients: [], subject: "Hi", body: "Hello" });
  });

  test("send_telegram reports a missing setup instead of failing silently", async () => {
    const telegram = jest.requireMock("../../telegram/telegram-service");
    telegram.sendTelegramMessage.mockResolvedValue({ ok: false, error: "Telegram is not configured." });
    expect(await dispatchToolCall("send_telegram", { text: "hi" }, "en")).toMatchObject({ success: false, message: "Telegram is not configured." });
  });
});

test("add_task saves the task with the planner's first step", async () => {
  (decompose as jest.Mock).mockResolvedValue({ firstAction: "Open the document", steps: ["a", "b", "c"], source: "rule_engine" });
  const result = await dispatchToolCall("add_task", { title: "finish my essay" }, "en");
  expect(mockCreateTaskWithPlan).toHaveBeenCalledWith("finish my essay", "Open the document", ["a", "b", "c"]);
  expect(result.message).toContain('Saved "finish my essay"');
});

test("add_task with a time schedules a reminder that opens the task", async () => {
  (decompose as jest.Mock).mockResolvedValue({ firstAction: "Open the document", steps: ["a", "b", "c"], source: "rule_engine" });
  const { scheduleLocalReminder } = jest.requireMock("../../native/reminders");
  const result = await dispatchToolCall("add_task", { title: "finish my essay", remindAt: "2026-10-20T18:00:00" }, "en");
  expect(scheduleLocalReminder).toHaveBeenCalledWith("finish my essay: Open the document", "2026-10-20T18:00:00", null, { kind: "task", taskId: "t1" });
  expect(mockSetReminderId).toHaveBeenCalledWith("t1", "n1");
  expect(result.message).toContain("I'll remind you");
});
