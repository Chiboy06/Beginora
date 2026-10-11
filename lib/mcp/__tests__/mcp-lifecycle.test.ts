jest.mock("../../native/mcp-server", () => ({
  startMcpServer: jest.fn(async () => ({ ip: "10.0.0.2", port: 8420 })),
  stopMcpServer: jest.fn(async () => {}),
  setActiveTokens: jest.fn(async () => {}),
  installMcpRequestListener: jest.fn(() => jest.fn()),
}));
jest.mock("../../storage/database", () => ({
  getConfig: jest.fn(async () => "false"),
  setConfig: jest.fn(async () => {}),
  deleteAllMcpClients: jest.fn(async () => {}),
}));

import { enableMcpServer, disableMcpServer, isMcpEnabled, MCP_DISABLED_MESSAGE } from "../mcp-lifecycle";
import { startMcpServer, stopMcpServer, setActiveTokens } from "../../native/mcp-server";
import { deleteAllMcpClients, setConfig, getConfig } from "../../storage/database";

beforeEach(() => jest.clearAllMocks());

it("refuses to enable plaintext MCP and revokes stored credentials", async () => {
  await expect(enableMcpServer()).rejects.toThrow(MCP_DISABLED_MESSAGE);
  expect(stopMcpServer).toHaveBeenCalled();
  expect(setActiveTokens).toHaveBeenCalledWith([]);
  expect(deleteAllMcpClients).toHaveBeenCalled();
  expect(setConfig).toHaveBeenCalledWith("mcp_enabled", "false");
  expect(startMcpServer).not.toHaveBeenCalled();
});

it("disable stops the server, clears active tokens and revokes stored pairings", async () => {
  await disableMcpServer();
  expect(stopMcpServer).toHaveBeenCalled();
  expect(setActiveTokens).toHaveBeenCalledWith([]);
  expect(deleteAllMcpClients).toHaveBeenCalled();
  expect(setConfig).toHaveBeenCalledWith("mcp_enabled", "false");
});

it("migrates a previously enabled setting to the disabled state", async () => {
  (getConfig as jest.Mock).mockResolvedValue("true");
  expect(await isMcpEnabled()).toBe(false);
  expect(stopMcpServer).toHaveBeenCalled();
  expect(deleteAllMcpClients).toHaveBeenCalled();
});
