jest.mock("../document-retriever", () => ({ queryDocuments: jest.fn() }));
jest.mock("../../native/system-actions", () => ({}));
jest.mock("../../native/reminders", () => ({}));
jest.mock("../../native/contacts", () => ({}));
jest.mock("../../native/communication", () => ({}));
jest.mock("../../native/calendar", () => ({}));
jest.mock("../../ai/decomposer", () => ({ decompose: jest.fn() }));

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
