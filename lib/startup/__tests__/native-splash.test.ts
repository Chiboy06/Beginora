import {
  createNativeSplashHideController,
  NATIVE_SPLASH_HIDE_MAX_ATTEMPTS,
  NATIVE_SPLASH_HIDE_RETRY_DELAY_MS,
} from "../native-splash";

describe("native splash hide controller", () => {
  const noDelay = jest.fn((_delayMs: number) => Promise.resolve());

  beforeEach(() => {
    noDelay.mockClear();
  });

  test("hides successfully once and is idempotent for concurrent and later calls", async () => {
    const hideAsync = jest.fn(() => Promise.resolve());
    const reportFailure = jest.fn();
    const hide = createNativeSplashHideController(hideAsync, reportFailure, noDelay);

    const first = hide();
    const concurrent = hide();
    expect(concurrent).toBe(first);
    await expect(first).resolves.toBe(true);
    await expect(hide()).resolves.toBe(true);

    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(reportFailure).not.toHaveBeenCalled();
    expect(noDelay).not.toHaveBeenCalled();
  });

  test("recovers after the first rejection and reports only safe attempt metadata", async () => {
    const hideAsync = jest.fn()
      .mockRejectedValueOnce(new Error("native detail that must not be forwarded"))
      .mockResolvedValue(undefined);
    const reportFailure = jest.fn();
    const hide = createNativeSplashHideController(hideAsync, reportFailure, noDelay);

    await expect(hide()).resolves.toBe(true);

    expect(hideAsync).toHaveBeenCalledTimes(2);
    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(1, NATIVE_SPLASH_HIDE_MAX_ATTEMPTS);
    expect(reportFailure.mock.calls[0]).not.toContain("native detail that must not be forwarded");
    expect(noDelay).toHaveBeenCalledWith(NATIVE_SPLASH_HIDE_RETRY_DELAY_MS);
  });

  test("stops after the bounded attempts when every hide call rejects", async () => {
    const hideAsync = jest.fn().mockRejectedValue(new Error("native detail"));
    const reportFailure = jest.fn();
    const hide = createNativeSplashHideController(hideAsync, reportFailure, noDelay);

    const first = hide();
    const concurrent = hide();
    expect(concurrent).toBe(first);
    await expect(first).resolves.toBe(false);
    await expect(hide()).resolves.toBe(false);

    expect(hideAsync).toHaveBeenCalledTimes(NATIVE_SPLASH_HIDE_MAX_ATTEMPTS);
    expect(reportFailure).toHaveBeenCalledTimes(NATIVE_SPLASH_HIDE_MAX_ATTEMPTS);
    expect(noDelay).toHaveBeenCalledTimes(NATIVE_SPLASH_HIDE_MAX_ATTEMPTS - 1);
  });
});
