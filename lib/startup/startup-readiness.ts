export const STARTUP_READY_TIMEOUT_MS = 1_500;

export type StartupReadiness = "finished" | "timed_out";

/**
 * Wait for lightweight startup tasks, but never let a stalled native operation
 * keep the entire application behind the launch screen indefinitely.
 */
export function waitForStartupTasks(
  startupWork: Promise<unknown>,
  timeoutMs = STARTUP_READY_TIMEOUT_MS,
): Promise<StartupReadiness> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: StartupReadiness) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish("timed_out"),
      Math.max(0, timeoutMs),
    );
    void startupWork.then(
      () => finish("finished"),
      () => finish("finished"),
    );
  });
}
