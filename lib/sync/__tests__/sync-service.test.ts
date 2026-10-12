const mockDb = {
  getAllAsync: jest.fn(),
  runAsync: jest.fn(),
};
const mockPrefs = { cloudSyncEnabled: true };
const mockConstants = {
  expoConfig: { extra: { apiUrl: "https://sync.example.test", enableCloudSync: true } },
};
const mockAuth = {
  getAccessToken: jest.fn(),
  refreshAccessToken: jest.fn(),
};
const mockFetch = jest.fn();

const queuedTask = {
  id: "queue-1",
  entity: "task",
  entity_id: "task-1",
  operation: "upsert",
  payload: JSON.stringify({ id: "task-1", title: "Draft report" }),
  attempts: 0,
  next_retry: 0,
};

function loadSyncService() {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({ __esModule: true, default: mockConstants }));
  jest.doMock("../../auth/auth-service", () => mockAuth);
  jest.doMock("../../storage/database", () => ({
    getDatabase: jest.fn(async () => mockDb),
  }));
  jest.doMock("../../store/prefs", () => ({ prefs: mockPrefs }));
  return require("../sync-service") as typeof import("../sync-service");
}

describe("sync service security gates", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrefs.cloudSyncEnabled = true;
    mockConstants.expoConfig.extra = {
      apiUrl: "https://sync.example.test",
      enableCloudSync: true,
    };
    mockDb.getAllAsync.mockResolvedValue([queuedTask]);
    mockDb.runAsync.mockResolvedValue(undefined);
    mockAuth.getAccessToken.mockResolvedValue("access-token-1");
    mockAuth.refreshAccessToken.mockResolvedValue("access-token-2");
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("does nothing unless both runtime and user opt-in are enabled", async () => {
    mockConstants.expoConfig.extra.enableCloudSync = false;
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockAuth.getAccessToken).not.toHaveBeenCalled();
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not access the queue or network when user consent is off", async () => {
    mockPrefs.cloudSyncEnabled = false;
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockAuth.getAccessToken).not.toHaveBeenCalled();
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("leaves queued data untouched when there is no authenticated session", async () => {
    mockAuth.getAccessToken.mockResolvedValue(null);
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS API URLs before reading queued records", async () => {
    mockConstants.expoConfig.extra.apiUrl = "http://sync.example.test";
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockAuth.getAccessToken).not.toHaveBeenCalled();
    expect(mockDb.getAllAsync).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uploads only with a Bearer token and removes the item after success", async () => {
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://sync.example.test/sync",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token-1" }),
      }),
    );
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody).toEqual({
      entity: "task",
      entityId: "task-1",
      operation: "upsert",
      payload: { id: "task-1", title: "Draft report" },
    });
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM sync_queue WHERE id = ?",
      "queue-1",
    );
  });

  it("refreshes an expired token once and retries the same queued item", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockAuth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer access-token-1");
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe("Bearer access-token-2");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "DELETE FROM sync_queue WHERE id = ?",
      "queue-1",
    );
  });

  it("does not discard or mark queue items failed when the session cannot refresh", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    mockAuth.refreshAccessToken.mockResolvedValue(null);
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockDb.runAsync).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("backs off non-authentication failures without exposing request payloads in the error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    const { runSyncCycle } = loadSyncService();
    await runSyncCycle();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "UPDATE sync_queue SET attempts = ?, last_error = ?, next_retry = ? WHERE id = ?",
      1,
      "HTTP 503",
      expect.any(Number),
      "queue-1",
    );
  });
});
