// apps/mobile/lib/native/mcp-server.ts
// TS wrapper over the native McpServerModule + the request event bridge. The
// native HTTP thread blocks on a CompletableFuture keyed by `id`; we run the
// JSON-RPC engine and call respondMcp(id, ...) to release it. Mirrors the
// memoryWarning bridge (NativeEventEmitter over emitDeviceEvent). The native
// module is read lazily per call — it registers before JS on device, and lazy
// access keeps this module unit-testable (the module ref is never captured at
// import time).

import { NativeModules, NativeEventEmitter } from "react-native";
import { handleJsonRpc } from "../mcp/mcp-server";

interface McpNativeModule {
  startServer(port: number): Promise<string>;
  stopServer(): Promise<void>;
  setActiveTokens(tokens: string[]): void;
  respondMcp(id: string, status: number, body: string): void;
}

function getMod(): McpNativeModule {
  return NativeModules.McpServerModule as McpNativeModule;
}

export async function startMcpServer(port: number): Promise<{ ip: string; port: number }> {
  const ip = await getMod().startServer(port);
  return { ip, port };
}

export function stopMcpServer(): Promise<void> {
  return getMod().stopServer();
}

export function setActiveTokens(tokens: string[]): void {
  getMod().setActiveTokens(tokens);
}

export function installMcpRequestListener(): () => void {
  const emitter = new NativeEventEmitter(NativeModules.McpServerModule);
  const sub = emitter.addListener(
    "mcpRequest",
    (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const event = payload as { id?: unknown; token?: unknown; body?: unknown };
      const { id, token, body } = event;
      if (typeof id !== "string" || typeof token !== "string" || typeof body !== "string") return;
      handleJsonRpc(body, token)
        .then((response) => getMod().respondMcp(id, 200, response))
        .catch(() => getMod().respondMcp(id, 500, ""));
    },
  );
  return () => sub.remove();
}
