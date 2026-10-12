import { waitForStartupTasks } from "../startup-readiness";

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
