jest.mock("../../storage/database", () => ({ getTaskOutcomes: jest.fn() }));

import { getTaskOutcomes, type TaskOutcomeRecord } from "../../storage/database";
import { detectFocusSignal } from "../detection-engine";

const getOutcomes = getTaskOutcomes as jest.MockedFunction<typeof getTaskOutcomes>;
const now = 1_800_000_000_000;

function history(...outcomes: TaskOutcomeRecord["outcome"][]): TaskOutcomeRecord[] {
  return outcomes.map((outcome, index) => ({
    id: index + 1,
    taskId: "task-1",
    outcome,
    createdAt: now - index * 1_000,
  }));
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(now);
  getOutcomes.mockReset();
});
afterEach(() => jest.restoreAllMocks());

test("counts three earlier stuck outcomes after skipping the active session start", async () => {
  getOutcomes.mockResolvedValue(history("started", "stopped", "wrong_moment", "snoozed"));
  await expect(detectFocusSignal({ taskId: "task-1", activeStartedAt: now, extensionCount: 0 }))
    .resolves.toMatchObject({ kind: "paralysis" });
});

test("a completion resets the stuck run", async () => {
  getOutcomes.mockResolvedValue(history("started", "stopped", "completed", "snoozed", "wrong_moment"));
  await expect(detectFocusSignal({ taskId: "task-1", activeStartedAt: now, extensionCount: 0 }))
    .resolves.toEqual({ kind: "none" });
});

test("a retry resets the stuck run", async () => {
  getOutcomes.mockResolvedValue(history("started", "snoozed", "retried", "wrong_moment", "stopped"));
  await expect(detectFocusSignal({ taskId: "task-1", activeStartedAt: now, extensionCount: 0 }))
    .resolves.toEqual({ kind: "none" });
});

test("still signals a long session and fails closed on storage errors", async () => {
  getOutcomes.mockResolvedValue([]);
  await expect(detectFocusSignal({ taskId: "task-1", activeStartedAt: now - 90 * 60_000, extensionCount: 0 }))
    .resolves.toMatchObject({ kind: "hyperfocus" });
  getOutcomes.mockRejectedValue(new Error("storage unavailable"));
  await expect(detectFocusSignal({ taskId: "task-1", activeStartedAt: now, extensionCount: 0 }))
    .resolves.toEqual({ kind: "none" });
});
