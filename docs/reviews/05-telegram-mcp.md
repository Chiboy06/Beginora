# Beginora Telegram and MCP Integration Audit

**Scope:** Telegram and MCP integrations, connector/permission boundaries, directly related tests and native configuration.
**Checkout:** `/home/ubuntu/Beginora-latest`, `6e20db88852138cd7bdba6a9c62c7434a76545fa` (matches the requested `origin/main` commit); branch `fix/integrate-latest-updates`; worktree was clean at review start.
**Method:** Static source/config/test review only. No application source was changed; no migration, build, test suite, or device/runtime exercise was performed. No `.env` file was read. Line evidence below refers to this checkout.

## Executive summary

**Overall: partial; runtime status not established.** The Telegram path for a user-requested task summary is wired from the task screen through the service to Telegram’s HTTPS `sendMessage` API, and the service escapes task content before HTML formatting. However, settings claim reminder delivery although the Telegram reminder helper has no caller in the app; the actual task reminder path schedules a local notification. Telegram credentials are stored through the generic SQLite config store, not the installed secure-storage API, and Telegram is missing from the connector inventory/permission disclosure model.

The MCP TypeScript control plane has an understandable intended route (settings switch → lifecycle → pairing token store → native event bridge → JSON-RPC → read-only tool allowlist → dispatcher/native read adapters → response). But this checkout contains no Android/iOS native project or MCP native-module/plugin implementation, despite the wrapper requiring `NativeModules.McpServerModule`. The native transport/authentication behavior therefore cannot be verified and successful device operation must not be inferred from the mocked bridge tests. Additional material issues: the UI says MCP data “stays on the phone” even though the paired client receives it; client authorization is all-or-nothing for the entire three-tool read allowlist; the local URL is HTTP; and the connector status is hard-coded as `not_requested` rather than reflecting server state.

No voice/audio code path was found in the reviewed Telegram/MCP routes. Local notifications, calendar, and contact permissions are separate on-device code paths; MCP read calls into the calendar/contacts adapters can encounter their OS permission prompts. This was verified only from code, not a device.

## End-to-end code paths reviewed

### Telegram

1. `app/settings.tsx:61-75` loads configuration, saves changed values, and sends a test message when the user taps the button. `app/settings.tsx:412-460` presents an Enable toggle, bot-token/chat-ID fields, and explicit test action.
2. `lib/telegram/telegram-service.ts:18-37` reads/writes the three Telegram keys through `getConfig`/`setConfig`. `lib/storage/database.ts:241-244,348-366` defines a generic SQLite `config(key,value)` table and upsert/read helpers.
3. `app/task/[id].tsx:157-170,323-331` calls `sendTaskSummary` only from the task screen’s explicit “Send to Telegram” control. `lib/telegram/telegram-service.ts:44-68,71-81` checks enabled/configured state, posts to Telegram over HTTPS, and escapes task title/first action before using HTML parse mode.
4. The settings copy also promises Telegram reminders (`app/settings.tsx:416`), and a helper exists (`lib/telegram/telegram-service.ts:83-92`), but repository call-site search found no application caller of `sendTelegramReminder`. The task’s reminder action is instead `scheduleLocalReminder` (`app/task/[id].tsx:136-155`).

### MCP

1. `app/mcp.tsx:20-56` loads persisted enabled state and calls `enableMcpServer` on settings-screen entry if enabled; the switch invokes enable/disable. “Add client” persists a client and emits a CLI command with bearer token (`app/mcp.tsx:58-73`).
2. `lib/mcp/mcp-lifecycle.ts:19-33` installs the JS listener, pushes active tokens, starts/stops the native server, and persists `mcp_enabled`. `lib/mcp/pairing-store.ts:22-55,69-76` generates a 24-byte random token, stores it through database helpers, pushes the active token list, revokes by deleting/re-pushing, and updates `last_seen`.
3. `lib/native/mcp-server.ts:20-35,37-52` expects the native module, subscribes to `mcpRequest`, forwards body/token to `handleJsonRpc`, and answers with `respondMcp`.
4. `lib/mcp/mcp-server.ts:24-76` handles initialize/list/call JSON-RPC. `lib/mcp/mcp-tools.ts:15-25,32-46` exposes every registry tool marked `returnsData`, rejects other tools, and calls the dispatcher. The current tools are contacts, calendar events, and imported-document query (`lib/mcp/__tests__/mcp-tools.test.ts:11-20`). `lib/orchestrator/tool-dispatcher.ts:97-105,146-164` validates arguments and routes to the read adapters. Calendar/contact adapters invoke their OS permission path (`lib/native/calendar.ts:18-24,94-113`; `lib/native/contacts.ts:11-14,19-41`); document query is handled by `lib/orchestrator/document-retriever.ts`.
5. The TypeScript engine itself does not authorize the token; the token is passed in and only used to touch the client after a tool call (`lib/mcp/mcp-server.ts:24,58-65`). Auth therefore depends on the absent native request handler.

## Findings

### 1. High — Required native MCP server implementation is absent from this checkout

**Evidence:** The wrapper casts `NativeModules.McpServerModule` and calls `startServer` (`lib/native/mcp-server.ts:13-25`), then calls `respondMcp` (`:37-48`). The Expo plugin list in `app.json:42-70` includes Expo plugins and `./plugins/with-system-actions`, but no MCP plugin. Repository inventory found no `android/` or `ios/` directory and no MCP native implementation; the only custom plugin sources are `plugins/with-android-signing.js` and `plugins/with-system-actions.js`. The native bridge unit test injects a fake module (`lib/native/__tests__/mcp-server.test.ts:19-31`).

**Impact:** The JavaScript UI/lifecycle is not enough to provide an HTTP listener. In this checked-in tree there is no verifiable implementation to register the module, bind port 8420, handle requests, or answer the bridge. Consequently, a working device server is not established and the feature appears incompletely integrated unless a separately supplied native module exists outside this repository.

**Suggested fix:** Add and register Android/iOS implementations (or an Expo config plugin that generates them), document the supported build path, and add native/build integration coverage. Verify start/stop, address binding, request dispatch and failure recovery on both platforms before presenting the server as operational.

### 2. High — MCP authentication boundary is not verifiable; the JSON-RPC engine does not enforce bearer tokens

**Evidence:** The native bridge forwards `event.token` to the JS handler (`lib/native/mcp-server.ts:43-48`). `handleJsonRpc` accepts the token but does not validate it before `initialize`, `tools/list`, or `tools/call` (`lib/mcp/mcp-server.ts:24-65`); its only token use is `touch(token)` after the tool call has already run (`:58-65`). Token allowlist synchronization is only declared through the wrapper/pairing store (`lib/native/mcp-server.ts:13-18,33-35`; `lib/mcp/pairing-store.ts:30-37`). There is no native implementation here to inspect for pre-dispatch authentication or revocation enforcement.

**Impact:** Contact details, calendar entries, and imported-document excerpts are exposed by the read tools. If the missing native layer does not reject absent, invalid, and revoked tokens before emitting a request, possession of the LAN endpoint could expose data; this is a material security boundary, not a verified exploit. In particular, touching a token after the tool returns is not authorization.

**Suggested fix:** Enforce token validation before emitting any request or executing any method, and add negative tests for missing/invalid/revoked tokens at the actual HTTP/native boundary. Consider a defense-in-depth check in JS before `tools/call`; do not mark a client active merely because a handler ran.

### 3. High — MCP UI understates data export and the local HTTP URL exposes a bearer credential on the LAN

**Evidence:** The UI explicitly says “Only reachable on this Wi-Fi. Data stays on the phone.” (`app/mcp.tsx:101-105`), yet the client is given an `http://` URL and `Authorization: Bearer <token>` header (`app/mcp.tsx:65-69`). The connector registry correctly records paired MCP data as leaving the device (`lib/connectors/registry.ts:75-85`). `tools/list`/`tools/call` return calendar/contact/document data to the client (`lib/mcp/mcp-server.ts:55-65`; `lib/mcp/mcp-tools.ts:20-25,32-45`).

**Impact:** Data does leave Beginora’s phone when requested by the paired client, and the receiving host can retain it. HTTP provides no transport encryption for the bearer token or returned contents on the local network. A Wi-Fi-only reachability limit is not equivalent to data remaining on the phone or a protected channel. The actual native bind/auth implementation remains unavailable for review.

**Suggested fix:** Replace the “data stays on the phone” wording with explicit disclosure that selected records are transmitted to the paired client and may be stored there. Document the local-network threat model and add a protected transport or a well-defined authenticated encrypted channel; avoid sending reusable bearer tokens and sensitive results over cleartext HTTP.

### 4. Medium — Pairing grants all read sources; advertised per-source enablement is not implemented

**Evidence:** The registry promises “Only the individual read-only source you enable” (`lib/connectors/registry.ts:75-85`). The MCP screen contains a server switch and add/revoke-client controls, but no source selection (`app/mcp.tsx:92-129`). `buildMcpToolList` exposes every `returnsData` tool (`lib/mcp/mcp-tools.ts:20-25`) and `callReadTool` checks only the global read-only flag (`:32-45`). The current allowlist is contacts, calendar events, and imported documents (`lib/mcp/__tests__/mcp-tools.test.ts:11-20`).

**Impact:** A client token is not scoped to an individual source. Any client accepted by the missing transport can request any exposed read tool; OS permission prompts may further gate calendar/contact reads, but do not provide the advertised per-source MCP grant. This is broader than the registry disclosure suggests.

**Suggested fix:** Implement explicit per-client/per-source grants and enforce them in the server on every call, or revise the claim to say pairing grants all listed read tools. Show scopes at pairing time and in the client list; test that ungranted tools fail without invoking the dispatcher.

### 5. Medium — MCP enabled state does not represent a live server across app sessions

**Evidence:** The lifecycle explicitly documents that the persisted flag is restored when the MCP screen opens, not on app launch (`lib/mcp/mcp-lifecycle.ts:1-5`). The restore path is in `app/mcp.tsx:20-38`; the root layout initializes chat/tasks but does not restore MCP (`app/_layout.tsx:25-33`).

**Impact:** After a process restart, the stored `mcp_enabled=true` value may be presented as enabled while no listener/server has been restored, until the user opens the MCP screen. A paired client can therefore fail to connect despite the persisted toggle. No app/device test was run to assess process/background behavior.

**Suggested fix:** Either restore on app startup/foreground with a reliable native lifecycle, or persist/display separate configured-vs-running state and clearly tell users that the app must be foregrounded and MCP settings reopened. Handle app background/termination explicitly.

### 6. Medium — Connector permission status is static for paired MCP, and Telegram is absent from the connector model

**Evidence:** `readConnectorPermissionStates` reads only calendar, notifications, and mail composer permissions, then returns a hard-coded `"paired-mcp": "not_requested"` (`lib/connectors/permission-service.ts:14-37`). The Connections screen displays those returned states (`app/connectors.tsx:28-37,46-64`), so the MCP status is not tied to `mcp_enabled`, a running listener, or client count. `CONNECTOR_REGISTRY` contains `paired-mcp` but no Telegram entry (`lib/connectors/registry.ts:8-87`); its capability type has no Telegram/network-send capability (`lib/connectors/types.ts:1-9`). Telegram is configured separately in Settings (`app/settings.tsx:412-460`).

**Impact:** Users can continue seeing “Not requested” for MCP when configured/enabled, so the connection status is misleading. Telegram’s external network send and the destination/data boundary are not represented on the Connections screen or in connector permission disclosure. This makes the advertised centralized permission/status inventory incomplete.

**Suggested fix:** Derive MCP status from actual server/client state (distinguish permission, configured, enabled, running, and failed). Add Telegram as an external-send connector with explicit data-egress/destination disclosure and status, or explicitly explain why it is managed outside Connections.

### 7. Medium — Telegram reminders are promised but not connected to the reminder execution path

**Evidence:** Settings promise “Send task summaries and reminders” (`app/settings.tsx:412-417`). `sendTelegramReminder` is exported and described as called when a reminder fires (`lib/telegram/telegram-service.ts:83-92`), but repository call-site search found no caller. The actual task-detail reminder directly schedules a local notification and stores its identifier (`app/task/[id].tsx:136-155`).

**Impact:** The user can enable Telegram expecting reminder delivery, but code evidence supports only explicit task-summary sends and a test message. The Telegram reminder helper does not make notifications fire, and no background Telegram reminder integration is wired in the current app paths reviewed.

**Suggested fix:** Either remove the reminder promise/helper until implemented, or connect an explicitly user-authorized and reliably scheduled path with retry/deduplication/cancellation behavior. Make the UI distinguish on-device notification from Telegram delivery and disclose that Telegram reminders require connectivity.

### 8. Medium — Telegram bot token is persisted in generic SQLite config, without secure-storage handling or save-failure feedback

**Evidence:** `saveTelegramConfig` writes token/chat ID/enabled through `setConfig` (`lib/telegram/telegram-service.ts:31-37`); the generic config table is SQLite (`lib/storage/database.ts:241-244,348-366`). The settings handler catches and discards save errors (`app/settings.tsx:65-68`). Secure Store is a project dependency and is used for auth tokens elsewhere (`package.json:33`; `lib/auth/auth-service.ts:59-61`), but not by Telegram. The token is also interpolated in the Telegram Bot API URL path (`lib/telegram/telegram-service.ts:49-52`).

**Impact:** A bot token is a bearer credential; its at-rest protection/backup handling is not established by this implementation, and the Settings UI can look updated while a failed database write is silently ignored. This review does not establish that the SQLite file is unprotected by the OS, only that no dedicated secret-storage or save-failure path is used here.

**Suggested fix:** Store the bot token in SecureStore (or an equivalent protected credential store), keep only non-secret config in SQLite, surface persistence errors, and ensure credentials are redacted from logs/diagnostics. Consider a configurable credential rotation/delete action.

## What appears sound in source (not runtime-verified)

- Telegram task-summary sending is attached to an explicit user tap, checks the enabled/configured state, uses HTTPS, and escapes `&`, `<`, and `>` before inserting task text into Telegram HTML (`app/task/[id].tsx:157-170`; `lib/telegram/telegram-service.ts:44-68,71-99`). No automatic task-summary send path was found.
- MCP tool exposure is currently limited to tools marked `returnsData`; mutating tools such as `make_call` are rejected before dispatcher invocation (`lib/mcp/mcp-tools.ts:15-18,32-45`; tests `lib/mcp/__tests__/mcp-tools.test.ts:23-36`). The shared registry identifies calendar/contact/document reads and the MCP implementation routes only those.
- The normal calendar/contact adapters use OS permission requests before reading (`lib/native/calendar.ts:18-24,94-113`; `lib/native/contacts.ts:11-14,19-41`). The connectors permission screen itself only reads current status and does not prompt (`lib/connectors/permission-service.ts:13-18`).
- MCP pairing code generates 24 random bytes for tokens, stores one token per client, and pushes the active list after add/revoke (`lib/mcp/pairing-store.ts:22-55,69-76`). This verifies TypeScript intent only; native validation/revocation behavior remains unverified.
- Despite the task referencing `lib/tools/confirmation.ts`, no such file exists in this checkout. Confirmation policy is in `lib/tools/tool-registry.ts:272-284` and its tests. MCP exposes only read tools, which the tool registry marks `confirmRequired: false`; the direct MCP dispatcher path therefore does not currently route a mutation around confirmation. The connector registry’s `confirmationRequired` fields are descriptive metadata, not enforcement in `mcp-tools.ts`.

## Test and verification gaps

- No tests were run (static-review-only scope). Existing MCP tests cover JSON-RPC handler behavior, tool allowlisting, mocked lifecycle, mocked pairing persistence, and an injected fake React Native module (`lib/mcp/__tests__/mcp-server.test.ts`, `mcp-tools.test.ts`, `mcp-lifecycle.test.ts`, `pairing-store.test.ts`, `lib/native/__tests__/mcp-server.test.ts`). They do not establish an actual listener, OS module registration, network protocol compatibility, auth, transport security, device permissions, background behavior, or end-to-end response path.
- No Telegram-specific tests were found for saving secrets, request construction, API errors/timeouts, HTML escaping, task-summary send, or reminder delivery. Settings’ async save errors are swallowed and lack a regression test.
- No test covers connector status changing with MCP enable/disable or source-level authorization. Existing `registry.test.ts` checks descriptive fields and capability names, not correspondence to live integrations (`lib/connectors/__tests__/registry.test.ts:8-45`).
- No tests establish what Telegram receives, how long credentials/data persist, whether secrets appear in backups, or how token rotation/revocation behaves end-to-end.

## Scope caveats

This report is a static audit of the requested Telegram/MCP and directly related permission/configuration paths at the stated commit. It does not make device/runtime claims. The missing native source may exist in an external or generated artifact not present in this checkout; if so, it needs independent review and integration evidence before MCP functionality/security can be called verified.
