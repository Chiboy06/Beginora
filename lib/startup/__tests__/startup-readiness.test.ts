import { startStartupTask, waitForStartupTasks } from "../startup-readiness";

test("releases startup as soon as initialization settles", async () => {
  await expect(waitForStartupTasks(Promise.resolve(), 500)).resolves.toBe("finished");
});

test("releases startup after the deadline when native initialization stalls", async () => {
  const neverSettles = new Promise<void>(() => {});
  await expect(waitForStartupTasks(neverSettles, 10)).resolves.toBe("timed_out");
});

test("a rejected initialization task does not block the app shell", async () => {
  await expect(waitForStartupTasks(Promise.reject(new Error("SQLite unavailable")), 500))
    .resolves.toBe("finished");
});

test("defers startup invocation until after the readiness timeout is armed", async () => {
  const events: string[] = [];
  const startupTask = startStartupTask(() => {
    events.push("started");
    throw new Error("synchronous native startup failure");
  }, () => events.push("caught"));
  const readiness = waitForStartupTasks(startupTask, 500);

  expect(events).toEqual([]);
  await expect(readiness).resolves.toBe("finished");
  expect(events).toEqual(["started", "caught"]);
});

test("releases the shell if a deferred startup task never settles", async () => {
  const neverSettles = new Promise<void>(() => {});
  const startupTask = startStartupTask(() => neverSettles, () => {});
  await expect(waitForStartupTasks(startupTask, 10)).resolves.toBe("timed_out");
});
