// The current Android MCP transport is plaintext HTTP on the local network.
// It is deliberately unavailable until an encrypted transport and scoped
// per-client permissions are implemented and verified.

import { setActiveTokens, stopMcpServer } from "../native/mcp-server";
import { deleteAllMcpClients, getConfig, setConfig } from "../storage/database";

export const MCP_PORT = 8420;
export const MCP_DISABLED_MESSAGE =
  "MCP is temporarily unavailable because this build cannot protect paired-client data with encrypted transport and per-source access controls.";

let removeListener: (() => void) | null = null;

export async function enableMcpServer(): Promise<{ ip: string; port: number }> {
  await disableMcpServer();
  throw new Error(MCP_DISABLED_MESSAGE);
}

export async function disableMcpServer(): Promise<void> {
  try {
    await stopMcpServer();
  } finally {
    removeListener?.();
    removeListener = null;
    await setActiveTokens([]);
    await deleteAllMcpClients();
    await setConfig("mcp_enabled", "false");
  }
}

export async function isMcpEnabled(): Promise<boolean> {
  if ((await getConfig("mcp_enabled")) === "true") {
    await disableMcpServer();
  }
  return false;
}
