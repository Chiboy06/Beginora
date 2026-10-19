import { createTokenBatcher } from "../token-batcher";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("many tokens become one update per interval, in order", () => {
  const flush = jest.fn();
  const batcher = createTokenBatcher(flush, 80);
  for (const token of ["Open", " the", " doc", "ument"]) batcher.push(token);

  expect(flush).not.toHaveBeenCalled();
  jest.advanceTimersByTime(80);
  expect(flush).toHaveBeenCalledTimes(1);
  expect(flush).toHaveBeenCalledWith("Open the document");
});

test("a 20 tokens-per-second stream causes about 12 updates a second, not 20", () => {
  const flush = jest.fn();
  const batcher = createTokenBatcher(flush, 80);
  for (let i = 0; i < 20; i += 1) {
    batcher.push("x");
    jest.advanceTimersByTime(50);
  }
  jest.advanceTimersByTime(80);
  expect(flush.mock.calls.length).toBeLessThanOrEqual(13);
  expect(flush.mock.calls.map((c) => c[0]).join("")).toBe("x".repeat(20));
});

test("reset drops pending text so nothing stale appears after the reply", () => {
  const flush = jest.fn();
  const batcher = createTokenBatcher(flush, 80);
  batcher.push("stale tool JSON");
  batcher.reset();
  jest.advanceTimersByTime(500);
  expect(flush).not.toHaveBeenCalled();

  batcher.push("fresh");
  jest.advanceTimersByTime(80);
  expect(flush).toHaveBeenCalledWith("fresh");
});
