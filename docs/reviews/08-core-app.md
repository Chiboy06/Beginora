# Beginora Core App End-to-End Audit

**Review basis:** `/home/ubuntu/Beginora-latest`, `origin/main` checkout at `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`6e20db8`). The working tree was already non-clean because `docs/reviews/` contained other untracked review artifacts; this audit created only `docs/reviews/08-core-app.md` and did not inspect or modify those artifacts. No application source, migration, secret, or `.env` file was read or changed.

**Scope:** Core task, chat/history, model, document, connector, voice/audio and notification paths centered on the requested screens and `lib/store/`, `lib/orchestrator/`, `lib/documents/`, plus directly called native/connector/storage code and related tests/config. **Static review only:** no app build, test suite, migration, simulator, or device was run. Statements below describe code paths and repository test coverage, not observed runtime/device behavior.

## Executive summary

**Overall: broken at clean-install/build integration level; otherwise partial.** The checked-in chat entry path imports a voice permission adapter that imports `expo-av`, but neither `expo-av` nor the other speech package named in that adapter's comment exists in `package.json` or `package-lock.json`. That is a likely clean-install typecheck/bundling blocker. Separately, the voice button opens `beginora://voice`, while the native speech activity is only declared as a non-exported activity without a launch intent-filter or JS native launch method; the registered code's return-to-chat link is implemented, but its launch path is not. Thus voice is not verified end-to-end and is statically disconnected.

The task and chat foundations are substantially implemented as local SQLite/on-device-model paths, with deterministic task decomposition when no model is loaded. Local notification permission is requested after a reminder action, and selected calendar/contact access is requested on demand. However, reminder lifecycle cleanup, long-history restoration, partial-write recovery, atomic document indexing, connector status accuracy, and privacy/credential handling all have gaps. The app should not yet describe every path as fully offline: Telegram explicitly sends task data over HTTPS, and Android speech recognition is delegated to a system recognizer whose offline/network behavior is not controlled here.

## End-to-end call-path map (static)

- **Boot/chat:** `app/_layout.tsx:25-33` awaits `useChatStore.init()` and `useTaskStore.loadTasks()` before showing routes. `lib/store/chat-store.ts:105-174` restores the latest chat, loads the active local model, warms the cache, and starts the foreground service. `app/index.tsx:279-285` wires `ChatInput` to `sendMessage`; `lib/store/chat-store.ts:236-291` appends and saves the user message then invokes `processMessage`; `lib/orchestrator/orchestrator.ts:57-71,137-150` constructs a prompt and calls the local LLM engine. Tool actions route through `tool-dispatcher.ts:97-179`; mutating calls can be held for confirmation (`orchestrator.ts:221-239`, `chat-store.ts:312-343,381-422`).
- **Tasks:** `app/(tabs)/tasks.tsx:81-109` loads/displays the task store and toggles status. `app/task/new.tsx:30-44` writes a task first, then calls `decompose`, then writes the plan. `lib/ai/decomposer.ts:54-84` uses a deterministic rule-engine fallback for short tasks/no loaded model and validates model JSON before accepting it. `app/task/[id].tsx:77-155` records selected outcomes and schedules one local reminder; `:157-170` can send a task summary to Telegram. Focus timing is JS/UI-driven in `app/task/focus.tsx:42-58`.
- **Documents:** `app/documents.tsx:104-153` uses the system document picker and classification, then calls `importAndIndexDocument`. `lib/documents/document-manager.ts:33-95` parses, chunks, embeds batches on-device, and writes the index. `lib/orchestrator/document-retriever.ts:17-98` embeds a query, ranks local chunks and returns excerpts to the local orchestrator.
- **Voice:** `ChatInput` imports `VoiceButton` (`components/ChatInput.tsx:9,46-50`); the button requests microphone permission and opens `beginora://voice` (`components/VoiceButton.tsx:15-35`). The JS adapter imports `expo-av` (`lib/native/voice-input.ts:6-8`). Kotlin `BeginoraVoiceActivity` uses Android `RecognizerIntent` and returns `beginora://chat?voice_text=...` (`native/android/src/main/java/app/beginora/android/BeginoraVoiceActivity.kt:54-86`); `app/index.tsx:120-148` handles chat-prefill links. The return half exists; the launch/dependency halves do not line up (Findings 1–2).
- **Permissions/connectors:** calendar/contact adapters request access when invoked (`lib/native/calendar.ts:18-24`, `lib/native/contacts.ts:11-14`); local notification permission is checked/requested when scheduling (`lib/native/reminders.ts:30-35`). The connection UI reads a subset of current permission states (`lib/connectors/permission-service.ts:13-38`). Email opens an editable OS composer rather than sending from Beginora (`lib/connectors/email-connector.ts:25-52`). Telegram is a separate direct HTTPS integration, not a row in the connection registry.

## Findings

### 1. Blocker — undeclared voice permission module is on the chat entry import graph

**Evidence:** `lib/native/voice-input.ts:6-8` imports `expo-av`. `components/VoiceButton.tsx:4` imports that adapter, and `components/ChatInput.tsx:9-10` imports `VoiceButton`; `app/index.tsx:15-17,279-285` imports/renders `ChatInput`. The checked-in dependency lists in `package.json:18-52` and the root package section of `package-lock.json:11-45` contain neither `expo-av` nor `expo-speech-recognition` (the latter is named in `voice-input.ts:1-3`).

**Impact:** A clean install from the checked-in manifest/lock has no declared package to resolve for this live import. This is likely to fail TypeScript/module resolution and can prevent the chat route/app bundle from loading, not merely disable the microphone.

**Suggested fix:** Choose one supported voice-permission/recognition integration, add its Expo-SDK-compatible package and lockfile entry (or remove the undeclared import in favor of the native bridge), then run clean-install typecheck and Android/iOS build checks. Keep the implementation comment in sync with the actual API.

**Confidence:** High (manifest/lock and direct import chain verified; build not run).

### 2. High — the voice button does not launch the native recognizer activity

**Evidence:** `components/VoiceButton.tsx:26-35` calls `Linking.openURL("beginora://voice")`. `plugins/with-system-actions.js:188-202` registers `.BeginoraVoiceActivity` with `android:exported="false"` but no intent-filter. `SystemActionsModule.kt:17-20,85-139` has no voice-launch method. The actual `BeginoraVoiceActivity` implementation only runs when launched (`.../BeginoraVoiceActivity.kt:22-35,54-86`). The app route's deep-link handler only accepts hostname `chat` or pathname `/chat` (`app/index.tsx:120-137`); there is no `app/voice` route in the reviewed routing setup. The return URI from Kotlin is the supported chat form and is handled (`BeginoraVoiceActivity.kt:77-82`, `app/index.tsx:125-133`).

**Impact:** Static wiring has no demonstrated path from tapping the mic to `BeginoraVoiceActivity`; opening the app scheme is not equivalent to explicitly starting that private activity. Consequently the native recognizer and transcript-prefill path cannot be considered integrated. Also, `VoiceButton` sets `listening` only around `openURL` (`:26-35`), which normally represents handoff completion rather than the recognizer's actual lifecycle; no transcript/error event clears that state.

**Suggested fix:** Expose an explicit native module method to launch the activity (or install a deliberate intent-filter/route that securely launches it), provide a result channel with cancellation/error handling, and keep the chat screen subscribed while the activity returns. Add Android instrumentation/device coverage for launch, permission denial, cancellation, result, repeated result, and app cold-start/background return.

**Confidence:** High for the missing wiring in checked-in sources; actual OS URL resolution was not device-tested.

### 3. Medium — speech-processing privacy/offline boundary is unspecified

**Evidence:** Android code launches `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` and specifies locale/prompt/result count but no offline preference or in-app recognizer (`BeginoraVoiceActivity.kt:54-60`). The UI documents Android-only voice (`components/VoiceButton.tsx:17-19`; `lib/native/voice-input.ts:32-40`), but the connection registry has no voice entry (`lib/connectors/registry.ts:8-87`). The Models screen says browsing/downloading a model is the only network use (`app/models.tsx:70-72`).

**Impact:** The operating system's installed recognition provider decides how audio is processed; this repository does not establish that recognition remains on-device. Actual data transfer depends on device/provider and is **not verified**. For an offline-first product and potentially sensitive planning input, the current code and copy cannot guarantee the audio/transcript stays local.

**Suggested fix:** Explicitly disclose that voice uses the OS recognizer and may use its provider/network, or implement/test a truly on-device recognizer. Do not promise offline voice unless verified on supported devices. Include voice in connector/privacy controls and describe microphone/audio retention and handoff behavior.

**Confidence:** Medium (external recognizer handoff is explicit; its network behavior is provider-dependent and unknown).

### 4. Medium — long conversations restore only their oldest 50 messages

**Evidence:** `lib/storage/database.ts:315-331` defaults `getMessages` to 50 and executes `ORDER BY created_at ASC LIMIT ?`; it does not fetch the newest page. Both startup restore (`lib/store/chat-store.ts:109-120`) and history selection (`:424-433`, called by `app/history.tsx:83-90`) use this default with no pagination.

**Impact:** Once a conversation exceeds 50 stored messages, restart/history selection restores the first 50, not the tail. The user will not see the latest exchange and new prompts are formed from stale restored context (the orchestrator's window is then sliced from those stale messages). This can look like lost or forgotten chat history despite the records remaining in SQLite.

**Suggested fix:** Add newest-page retrieval (for example query newest N descending and reverse for display) and pagination/load-older support. Add a DB/store regression test with >50 messages verifying the latest turn and correct chronological display/context after restart.

**Confidence:** High (SQL order/limit and both consumers verified).

### 5. Medium — chat save failures retain only volatile copies and proceed without retry

**Evidence:** `lib/store/chat-store.ts:236-264` puts the user message into Zustand first; if conversation/message persistence fails, it calls `notePersistFailure` and still continues. Assistant persistence is independently attempted at `:360-370`. Existing regression tests explicitly assert that the failed message remains only in memory and a notice is shown (`lib/store/__tests__/chat-store-persistence.test.ts:134-162`).

**Impact:** The warning is a useful safeguard, but it does not restore the missing row. If the app is terminated/restarted after a failed write, the affected user text or answer disappears; a later assistant row can also survive without its user prompt. There is no durable retry/export path in the reviewed flow.

**Suggested fix:** Preserve the visible warning, but offer retry/save/export or mark each turn as unsaved until its paired messages commit. Consider an atomic conversation/turn write and avoid saving an assistant response as durable when the source user message was not.

**Confidence:** High (store behavior and regression assertions verified).

### 6. Medium — task creation can report failure after the task was already committed

**Evidence:** `app/task/new.tsx:30-44` first awaits `addTask` (`:37`), then decomposes and persists the plan (`:38-40`); a later failure reaches the same generic “couldn’t save that task” message (`:41-44`). `lib/store/task-store.ts:45-70` persists and returns the task before plan generation; a failed `setPlan` restores the prior task object but does not delete the created task (`:73-88`).

**Impact:** If plan persistence or a later step fails, the task remains saved in the store/database while the modal tells the user saving failed. Retrying can create a duplicate task. The rule-engine fallback makes ordinary no-model decomposition available, but it does not make this multi-step write atomic.

**Suggested fix:** Make “task saved, plan pending” an explicit recoverable state and route to the saved task with a retry-plan action, or coordinate task+plan persistence atomically. Use a specific error message so retry cannot silently duplicate.

**Confidence:** High (order and rollback behavior verified).

### 7. Medium — task reminder lifecycle is not tied to task lifecycle or notification taps

**Evidence:** `app/task/[id].tsx:136-155` schedules a notification then stores its identifier. If `setReminderId` fails after scheduling, catch displays “Reminder not set” although the OS notification already exists. `lib/native/reminders.ts:59-70` can return an identifier but cancellation is only used when replacing an ID; `lib/store/task-store.ts:143-152` removes a task without cancellation, and `app/task/[id].tsx:77-89` marks a task done without cancellation. `lib/storage/database.ts:986-992` deletes task/outcomes only. Notification content has title/body but no task ID (`lib/native/reminders.ts:62-69`), and `app/_layout.tsx:76-112` registers no notification-response route handler.

**Impact:** A task can be deleted or completed while its reminder remains scheduled; an OS notification may also be orphaned if its ID write fails, allowing duplicates on retry. Tapping a notification cannot deep-link to the associated task in this app code.

**Suggested fix:** Persist notification/task association robustly, cancel on deletion/completion/replacement, reconcile scheduled IDs after restart, and include a task route payload plus a response listener. If scheduling succeeds but persistence fails, cancel the new notification before reporting failure. Test denial, schedule success/DB failure, delete/done, restart, and tap routing.

**Confidence:** High (side-effect and cleanup paths verified; OS delivery/tap not run).

### 8. Medium — document metadata and chunk index are committed separately

**Evidence:** `lib/documents/document-manager.ts:77-85` awaits `saveDocument` and only then `saveChunks`. `lib/storage/database.ts:686-704` inserts document metadata outside a transaction; chunk insertion has its own transaction at `:706-734`. The `documents`/`chunks` migration (`:88-113`) does not declare a foreign-key cascade. `app/documents.tsx:126-153` catches failures but only refreshes on full success.

**Impact:** If chunk insertion fails after metadata succeeds, import reports failure while leaving a document row with a nonzero `chunkCount` but no usable chunks. The failed item may appear after reopening, and the UI has no repair/re-index operation. Source files are intentionally not retained by this pipeline, so recovery requires selecting the original again.

**Suggested fix:** Insert document metadata and all chunks in one DB transaction (or clean metadata on chunk failure), report a recoverable index state, refresh after failure, and add failure-injection tests.

**Confidence:** High (write/transaction boundaries verified).

### 9. Medium — Telegram credentials use the generic SQLite config table

**Evidence:** `lib/telegram/telegram-service.ts:18-37` reads/writes `telegram_bot_token` and chat ID through generic `getConfig`/`setConfig`. `lib/storage/database.ts:241-243,350-365` stores config values as ordinary SQLite `TEXT` values without an encryption layer in this path. The settings form masks the token visually (`app/settings.tsx:431-441`), but saves the value to that service on edits (`:65-68`). `expo-secure-store` is present in dependencies (`package.json:31-34`) but is not used for this token path.

**Impact:** Masking prevents casual on-screen viewing, not at-rest disclosure from database access/backups. A bot token is a reusable credential; exposure could allow a third party to act as the configured bot. No compromise was observed; this is a storage-risk finding based on the implementation.

**Suggested fix:** Store the bot token in platform Keychain/Keystore-backed SecureStore, keep non-secret chat ID/config in SQLite, clear the secure value when disabled/disconnected, and test migration of any existing stored token without logging it.

**Confidence:** High (storage path verified; exploitability depends on device/backup threat model).

### 10. Medium — network/privacy copy and connector inventory disagree with actual integrations

**Evidence:** Models copy says model browsing/downloading is the “only time” Beginora uses the network (`app/models.tsx:70-72`). Telegram sends a direct HTTPS request containing task text (`lib/telegram/telegram-service.ts:44-64`), invoked by an explicit task-detail button (`app/task/[id].tsx:157-170`). Email opens an external composer (`lib/connectors/email-connector.ts:25-52`). Telegram is configured under Settings (`app/settings.tsx:412-464`) but absent from `CONNECTOR_REGISTRY` (`lib/connectors/registry.ts:8-87`) and the Connections screen maps only registry entries (`app/connectors.tsx:46-67`). Contacts and voice are also absent from that list although they request/use OS capabilities (`lib/native/contacts.ts:11-14`, voice code above).

**Impact:** The send button itself is explicit, but the global network statement is inaccurate and the connection inventory is incomplete. Users reviewing Connections can miss Telegram's active network path and contact/voice permission surfaces. This weakens informed privacy expectations for sensitive task descriptions.

**Suggested fix:** Update copy to enumerate explicitly user-triggered external paths and make Telegram/email/OS speech handoffs visible in a connection/privacy inventory. Say exactly which fields leave the device, where they go, and when; do not state “only” model downloads if direct API traffic exists.

**Confidence:** High (direct fetch and UI/registry paths verified).

### 11. Low — connector permission badges are partly constants, not live connection state

**Evidence:** `lib/connectors/permission-service.ts:14-37` reads calendar, notification, and email availability, but hardcodes documents and model as `available` and paired MCP as `not_requested`; `app/connectors.tsx:19-26,46-65` renders those values as “Ready”/“Not requested.” It does not read whether a model is installed/active, documents are present, or MCP clients/server are paired/enabled.

**Impact:** The Connections screen can say “Ready” with no active local model or say “Not requested” despite a paired MCP client. Users can mistake capability/catalog metadata for actual connected state.

**Suggested fix:** Derive status from the real stores/services or label these entries as “feature available” rather than permission/connection state. Add contact, voice, and Telegram with accurate permission, availability, and external-data semantics.

**Confidence:** High.

### 12. Low — task-list completion bypasses the activity log

**Evidence:** The quick checkbox calls only `setStatus` (`app/(tabs)/tasks.tsx:106-109`). The task-detail completion path separately calls `recordOutcome(task.id, "completed")` (`app/task/[id].tsx:77-88`), and the detail screen renders stored outcomes as “Recent activity” (`:311-320`).

**Impact:** Completing from the list changes status/completedAt but does not create the corresponding outcome record, so task activity history is incomplete and differs by which UI path was used.

**Suggested fix:** Centralize complete/reopen transitions in the store and record the matching outcome consistently, with a test for both list and detail actions.

**Confidence:** High.

### 13. Low — document ingestion has no visible input-size/page bound

**Evidence:** `app/documents.tsx:110-130` accepts a picked asset without checking `asset.size`; `lib/documents/document-manager.ts:33-60` parses the full document and chunks/embeds all content. PDF parsing reads the whole file as base64 and decodes it before extracting every page (`lib/documents/parsers.ts:60-94`); TXT and DOCX likewise read full contents (`:27-40,103-118`). No limit is applied in these paths.

**Impact:** A very large PDF or text file can create high JS/native memory and long blocking work on mobile. The user-visible progress is limited and there is no size/page cap or cancellation path. This is a capacity risk, not a reproduced crash.

**Suggested fix:** Enforce a documented size/page/chunk ceiling before decoding; release PDF resources on error, provide cancellation, and test large/hostile files on low-memory devices.

**Confidence:** Medium (absence of a bound is static; actual device threshold is unknown).

## What appears sound in code (not runtime-verified)

- **Task planning has an offline fallback:** `decompose` bypasses model generation for short tasks or when no local model is loaded (`lib/ai/decomposer.ts:68-84`); longer local-model output is validated before use (`:72-83`). It is not a medical diagnosis/treatment flow; settings state that distinction (`app/settings.tsx:283-288`).
- **Chat routes through a local model engine and keeps pending destructive actions pending:** the orchestrator checks `isLoaded` and calls the app's LLM engine (`lib/orchestrator/orchestrator.ts:71-74,137-150`); default `confirm_destructive_actions` is initialized to true (`lib/storage/database.ts:259-261`), and pending actions execute only after confirmation (`lib/store/chat-store.ts:312-343,381-422`). Users can disable that global switch in Settings (`app/settings.tsx:234-250`), so confirmation is not an invariant when opted out.
- **Calendar/contact permission is not requested at app boot:** calendar checks/requests when the calendar operation runs (`lib/native/calendar.ts:18-24`); contacts uses `requestPermissionsAsync` on search/name-resolution (`lib/native/contacts.ts:11-14,33-41`). Calendar query output is shaped to bounded event fields and a date range (`calendar.ts:115-149`); contact search caps returned matches at ten (`contacts.ts:43-65`).
- **Local task reminders use local Expo Notifications and request permission at scheduling time:** `lib/native/reminders.ts:11-35,43-70` configures an Android channel and asks for permission only when called. Android `POST_NOTIFICATIONS` is present in `app.json:17-28`; delivery on a particular OS/device was not tested.
- **Document selection/format validation and local index path exist:** the picker copies the selected document to cache and checks supported format (`app/documents.tsx:110-130`); parser supports TXT/MD/DOCX/PDF (`lib/documents/parsers.ts:101-119`); query code embeds/ranks locally and returns cited chunks (`lib/orchestrator/document-retriever.ts:45-97`).
- **Email handoff is user-reviewed:** `openEmailDraft` checks composer availability and opens a draft without a Beginora send call (`lib/connectors/email-connector.ts:25-52`); the UI explicitly says user must review/send (`app/email.tsx:38-42,89-90`).
- **Voice platform/permission declaration is partial but present:** Android declares `RECORD_AUDIO` and iOS usage-description strings exist in `app.json:17-40`; code explicitly limits voice to Android (`lib/native/voice-input.ts:16-40`). This does not cure the undeclared dependency or missing native launch path above.

## Test coverage and verification gaps

- Existing tests are targeted unit tests: chat-store persistence notices (`lib/store/__tests__/chat-store-persistence.test.ts`), prompt/history-window stability (`lib/orchestrator/__tests__/history-stability.test.ts`), pure document helpers (`lib/documents/__tests__/chunker.test.ts`, `parse-util.test.ts`, `similarity.test.ts`), calendar permission/query behavior (`lib/native/__tests__/calendar.test.ts`), appointment-notification bookkeeping (`lib/native/__tests__/appointment-reminders.test.ts`), connector registry/email validation (`lib/connectors/__tests__/registry.test.ts`, `email-connector.test.ts`).
- No voice-input/VoiceButton test, Android activity instrumentation test, or deep-link lifecycle test was found. No task-store/task-reminder lifecycle test, notification delivery/tap/cancel test, or live connector permission-status test was found.
- No document-manager integration/failure-injection test was found for metadata/chunk atomicity, parser/model bridge integration, or large files. Existing parser/chunker/similarity tests do not verify the whole import flow.
- The history stability test exercises orchestrator window construction, not SQLite's `getMessages(limit=50)` ordering/page behavior. Chat persistence tests verify notices for individual mocked failures, not restart after a failed user save, paired-turn atomicity, or long-history reload.
- No tests were run for this review because the task was explicitly static-only. No claim is made about device permission prompts, Android intent resolution, model load performance, PDF Hermes behavior, notification delivery, or external provider/network behavior.

## Recommended order

1. Fix the undeclared voice dependency and implement an explicit, tested native launch/result path (or remove voice from the current chat bundle until complete).
2. Correct network/voice privacy disclosure and move Telegram's bot token to secure storage.
3. Fix message restore pagination and make task/reminder/document multi-step writes recoverable/atomic; cancel and route task reminders.
4. Align connector status badges and activity logging with actual service state, then add device-level regression tests for permission and native handoffs.
