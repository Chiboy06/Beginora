export const NATIVE_SPLASH_HIDE_MAX_ATTEMPTS = 3;
export const NATIVE_SPLASH_HIDE_RETRY_DELAY_MS = 250;

export type NativeSplashHideFailureReporter = (
  attempt: number,
  maxAttempts: number,
) => void;

export type NativeSplashRetryWait = (delayMs: number) => Promise<void>;

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Create a one-shot controller that hides the native splash at most three
 * times. Concurrent callers share the same attempt sequence, and success is
 * remembered so later calls are harmless.
 */
export function createNativeSplashHideController(
  hideAsync: () => Promise<void>,
  reportFailure: NativeSplashHideFailureReporter,
  wait: NativeSplashRetryWait = waitForRetry,
): () => Promise<boolean> {
  let attempts = 0;
  let hidden = false;
  let inFlight: Promise<boolean> | null = null;

  return function hideNativeSplash(): Promise<boolean> {
    if (hidden) return Promise.resolve(true);
    if (inFlight) return inFlight;
    if (attempts >= NATIVE_SPLASH_HIDE_MAX_ATTEMPTS) return Promise.resolve(false);

    // Defer running the attempt until inFlight has been assigned, so even a
    // re-entrant/concurrent call cannot start a second native hide operation.
    inFlight = Promise.resolve()
      .then(async () => {
        while (attempts < NATIVE_SPLASH_HIDE_MAX_ATTEMPTS) {
          attempts += 1;
          try {
            await hideAsync();
            hidden = true;
            return true;
          } catch {
            try {
              // Intentionally do not forward the exception or message: native
              // errors can contain device-specific details or other secrets.
              reportFailure(attempts, NATIVE_SPLASH_HIDE_MAX_ATTEMPTS);
            } catch {
              // Logging/reporting must not prevent a bounded retry.
            }
            if (attempts < NATIVE_SPLASH_HIDE_MAX_ATTEMPTS) {
              try {
                await wait(NATIVE_SPLASH_HIDE_RETRY_DELAY_MS);
              } catch {
                // If the delay mechanism fails, continue with the next bounded
                // attempt instead of leaving the native splash indefinitely.
              }
            }
          }
        }
        return false;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
