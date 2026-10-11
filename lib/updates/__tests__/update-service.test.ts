jest.mock("expo-updates", () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import * as Updates from "expo-updates";
import { checkForAppUpdate } from "../update-service";

const updates = Updates as jest.Mocked<typeof Updates>;

describe("checkForAppUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Reflect.set(globalThis, "__DEV__", false);
    Object.defineProperty(Updates, "isEnabled", { configurable: true, value: true });
  });

  it("reports no available update without downloading", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false } as never);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "up_to_date" });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("downloads and reloads only an available update", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never);
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "reloading" });
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps the current app usable when the update service is disabled", async () => {
    Object.defineProperty(Updates, "isEnabled", { configurable: true, value: false });
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "unavailable" });
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    Object.defineProperty(Updates, "isEnabled", { configurable: true, value: true });
  });

  it("returns a safe message for network/update errors", async () => {
    updates.checkForUpdateAsync.mockRejectedValue(new Error("internal server detail"));
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "failed" });
  });
});
