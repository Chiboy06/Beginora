jest.mock("expo-updates", () => ({
  get isEnabled() { return Reflect.get(globalThis, "__testUpdatesEnabled") ?? true; },
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));

import * as Updates from "expo-updates";
import * as Network from "expo-network";
import { applyDownloadedAppUpdate, checkForAppUpdate } from "../update-service";

const updates = Updates as jest.Mocked<typeof Updates>;
const network = Network as jest.Mocked<typeof Network>;

describe("EAS OTA updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Reflect.set(globalThis, "__DEV__", false);
    Reflect.set(globalThis, "__testUpdatesEnabled", true);
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: true, isInternetReachable: true } as never);
  });

  it("reports no available update without downloading", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false } as never);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "up_to_date" });
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("downloads an update but does not restart until the apply action", async () => {
    updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true } as never);
    updates.fetchUpdateAsync.mockResolvedValue({ isNew: true } as never);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "update_ready" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    await applyDownloadedAppUpdate();
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("keeps the current app usable when the update service is disabled", async () => {
    Reflect.set(globalThis, "__testUpdatesEnabled", false);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "unavailable" });
    await expect(applyDownloadedAppUpdate()).rejects.toThrow("not connected");
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    Reflect.set(globalThis, "__testUpdatesEnabled", true);
  });

  it("asks for internet access before checking the preview channel", async () => {
    network.getNetworkStateAsync.mockResolvedValue({ isConnected: false, isInternetReachable: false } as never);
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "offline" });
    expect(updates.checkForUpdateAsync).not.toHaveBeenCalled();
    expect(updates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it("returns a safe message for network/update errors", async () => {
    updates.checkForUpdateAsync.mockRejectedValue(new Error("internal server detail"));
    await expect(checkForAppUpdate()).resolves.toMatchObject({ status: "failed" });
  });
});
