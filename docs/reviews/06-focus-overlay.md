# Focus Detection & Floating Chat Overlay Audit

**Review target:** `/home/ubuntu/Beginora-latest`
**Checkout:** `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`feat: app update`, aligned with `origin/main`)
**Scope:** Focus detection, task/focus screens, floating bubble, Android voice/service/notification wiring, related app config and tests. Static review only; no device/runtime verification was performed.

## Executive summary

**Overall status: PARTIAL.** The task detail screen statically records a start and navigates into a five-minute focus screen; a task-scoped history-based detection function and an in-app bubble are present. However, several recent integrations are incomplete: the voice and icon imports do not resolve in the current dependency tree; the bubble's `beginora://voice` link has no route/activity wiring; the “paralysis” signal is cut off by the `started` event before it can be scored; and the bubble is an in-app React Native `Modal`, not a cross-app Android overlay. The service/notification path is also started unconditionally and has no service-path notification permission request.

The current TypeScript check reports unresolved module errors in the new bubble/voice paths (plus an unrelated decomposer type error). The focused timer Jest suite cannot start because Babel detects duplicate Worklets/Reanimated plugins. No inference below should be read as evidence of runtime behavior on Android/iOS.

## Call-path trace (verified statically)

1. **Task start:** `app/task/[id].tsx:122-128` awaits `setStatus(task.id, "active")`, records `started`, then pushes `/task/focus`.
2. **Focus timer and detection:** `app/task/focus.tsx:42-58` creates a 5-minute deadline and calls `runDetection` at zero; `:81-98` extends the timer and also invokes detection. `runDetection` calls `detectFocusSignal` with the task ID and in-memory start/extension values (`:29-40`).
3. **Detection data:** `lib/focus/detection-engine.ts:39-45` queries up to 20 outcomes for that task and silently returns `{kind:"none"}` on storage error. `:48-75` evaluates the elapsed-time/extension condition first, then scans newest-first history for a stuck run. `lib/storage/database.ts:966-984` scopes the query to the task and orders by `created_at DESC`.
4. **Bubble/service:** `app/_layout.tsx:110-112` mounts `FloatingBubble` at the root. `components/FloatingBubble.tsx:45-54` formats a status label and calls `updateServiceNotification` on Android. The React `Modal` is rendered only when the app is foregrounded and a task is active (`:56-68`).
5. **Voice path:** `components/VoiceButton.tsx:15-35` requests microphone permission and then calls `Linking.openURL("beginora://voice")`. The floating bubble uses the same URI (`components/FloatingBubble.tsx:77-89`). `plugins/with-system-actions.js:188-201` declares `BeginoraVoiceActivity` as non-exported without a URI intent filter. In contrast, the Android widget launches the activity by explicit component intent (`native/android/.../BeginoraWidgetProvider.kt:52-59`). The activity checks `RECORD_AUDIO`, starts Android speech recognition, then returns text using `beginora://chat?voice_text=...` (`BeginoraVoiceActivity.kt:22-35,54-85`). The JS listener in `app/index.tsx:120-148` handles `chat` URLs, not `voice` URLs.

## Findings

### 1. BLOCKER — Recent overlay/voice imports are unresolved in the checked-out dependency graph

**Evidence:** `lib/native/voice-input.ts:6-8` imports `expo-av`; `components/FloatingBubble.tsx:24` and `components/VoiceButton.tsx:3` import `@expo/vector-icons`. Neither package appears in the dependency list in `package.json:18-53`, and neither is present in this checkout's `node_modules`. Running `npm run typecheck -- --pretty false` produced `TS2307` for all three import sites. It also emitted a separate, out-of-scope type error at `lib/ai/decomposer.ts:23`.

**Impact:** A clean dependency install cannot type-resolve these modules; in particular, the root-mounted bubble and chat voice component import unresolved packages. The voice permission path cannot compile/typecheck as written. A production bundle is therefore not verified and is likely to fail module resolution.

**Suggested fix:** Add compatible direct dependencies and lockfile entries, or replace these imports with APIs/packages already supported by this Expo SDK. Re-run typecheck and an Expo/Metro bundle from a clean install; separately address the unrelated decomposer error.

### 2. HIGH — `beginora://voice` does not statically route to the Android voice activity

**Evidence:** Both `FloatingBubble.tsx:80-83` and `VoiceButton.tsx:26-32` call `Linking.openURL("beginora://voice")`. The scheme is declared in `app.json:9`, but the custom plugin only adds the `BeginoraVoiceActivity` declaration at `plugins/with-system-actions.js:188-201` with `android:exported="false"` and no `intent-filter`. There is no `/voice` Expo Router route in the checked-in `app/` route inventory. The only verified path into that activity is the widget's explicit `Intent(context, BeginoraVoiceActivity::class.java)` at `BeginoraWidgetProvider.kt:52-59`. The app's JS deep-link handler at `app/index.tsx:120-148` handles `chat`/`/chat`, not `voice`.

**Impact:** The bubble's Speak action (and the chat voice button after permission is granted) has no statically connected launcher for the native recognizer. The successful explicit widget path does not validate either in-app link. The bubble also renders its Speak button on iOS, while `lib/native/voice-input.ts:17,32-35` explicitly limits voice input to Android.

**Suggested fix:** Use a supported explicit native-module/activity launch path or add a correctly configured app route that launches the native activity; keep the activity non-exported unless there is a deliberate, validated external intent contract. Hide/disable the bubble voice action on unsupported platforms. Test cold/warm launch and transcript return through the actual app entry point.

### 3. MEDIUM — “Floating bubble” is foreground-only, not a system-wide overlay

**Evidence:** The comment at `components/FloatingBubble.tsx:1-8` describes a persistent floating overlay, but the implementation returns `null` whenever the app is backgrounded or there is no active task (`:56-59`). When shown, it is a React Native `Modal` (`:61-68`) mounted in the app root (`app/_layout.tsx:110-112`). The Android config/plugin declares a foreground service and notification (`app.json:22-25`, `plugins/with-system-actions.js:237-260`), but no `SYSTEM_ALERT_WINDOW` permission or `TYPE_APPLICATION_OVERLAY` implementation exists in the reviewed paths.

**Impact:** It cannot remain as a bubble over other apps or while Beginora is backgrounded. In the background, the intended entry point is a notification, not the bubble. This is not a missing permission for the current `Modal` implementation; it is a product/implementation boundary that should be explicit.

**Suggested fix:** If cross-app display is intended, implement a supported Android overlay/service flow with user-consented overlay access and lifecycle controls. Otherwise describe this as an in-app heads-up bubble, and ensure the notification fallback is permission-aware and tested.

### 4. MEDIUM — The “paralysis” signal is not reachable through the implemented focus-screen flow

**Evidence:** The engine stops its newest-first scan at either `completed` or `started` (`lib/focus/detection-engine.ts:59-65`). The only caller found is the focus screen (`app/task/focus.tsx:29-40`), where detection runs at timer completion or when extending (`:52-55,89-96`). Before navigating there, the task detail screen records a fresh `started` outcome (`app/task/[id].tsx:122-128`). The comment in `detection-engine.ts:7` says the engine is called from both focus and task-detail screens, but `app/task/[id].tsx` has no detector import/call.

**Impact:** At each normal focus-screen detection the newest outcome is `started`, so the paralysis loop breaks before counting any earlier `snoozed`, `wrong_moment`, or `stopped` streak. The task-detail integration claimed in the engine comment is absent. The hyperfocus branch can still be reached by time/extension inputs, but the paralysis nudge is effectively disconnected from the current UI path.

**Suggested fix:** Decide where the history-based nudge belongs (for example, evaluate before writing the new `started` event on task detail, or redesign the scoring boundary), and add tests for event sequences including retries, starts, stops, and completions.

### 5. MEDIUM — Notification permission is declared but not requested on the foreground-service path

**Evidence:** `app.json:22` declares `POST_NOTIFICATIONS`. The service is started during chat-store initialization (`lib/store/chat-store.ts:105-128`) and the bubble updates its notification (`components/FloatingBubble.tsx:45-54`). The only `Notifications.requestPermissionsAsync()` call found is in the explicit local-reminder helper (`lib/native/reminders.ts:30-35`); the service-start/update path does not check or request notification permission.

**Impact:** On Android configurations where notification permission is denied or has not been granted, the promised notification re-entry path is not assured. Declaring a manifest permission is not the same as obtaining runtime permission. This was established statically; no Android permission state was exercised.

**Suggested fix:** If the notification is necessary for background re-entry, check/request permission through a transparent, user-driven flow and handle denial in the UI. Otherwise do not imply that re-entry notification is guaranteed. Test grant, deny, and later-enable cases on supported Android API levels.

### 6. MEDIUM — The foreground service is started unconditionally and carries task text

**Evidence:** Root initialization calls chat-store `init()` (`app/_layout.tsx:25-33`); `init()` starts the service unconditionally at `lib/store/chat-store.ts:127-128`, independent of active tasks. `BeginoraService.onStartCommand` returns `START_STICKY` (`native/android/.../BeginoraService.kt:29-36`) and builds an ongoing notification (`:68-74`). The bubble's status includes up to 60 characters of the active task title (`components/FloatingBubble.tsx:47-53`); no notification redaction/visibility policy is set in the service builder (`BeginoraService.kt:68-84`). The stop wrapper exists in `lib/native/vesta-service.ts:18-21`, but no caller was found in the reviewed app paths.

**Impact:** A persistent service/ongoing notification can be created even when the user has no active task and may remain after focus ends. When a task is active, task text is deliberately sent to the OS notification surface; exposure depends on device/user notification and lock-screen settings, so this is a privacy consideration rather than a proven leak. The service also claims to keep the model alive, but no device/process-lifecycle evidence was collected.

**Suggested fix:** Tie service start/stop to a user-visible need and define a lifecycle/opt-out policy. Prefer generic notification text or explicit user choice before showing task titles; set/document appropriate visibility and test service cleanup after task completion, app exit, and denied notification permission.

### 7. MEDIUM — Focus timer and elapsed-session context are only in component memory

**Evidence:** `app/task/focus.tsx:17-28` stores remaining time, running state, extension count, deadline, and `activeStartedAt` in React state/refs initialized on mount. The task's `active` status is persisted separately by the store/database (`lib/store/task-store.ts:97-115`, `lib/storage/database.ts:887-897`), but no timer deadline or extension count is persisted/restored in the reviewed paths.

**Impact:** If the focus screen/process is recreated, the task may remain active while the UI starts a fresh five-minute timer and resets elapsed-duration context. The focus-session timer is therefore not crash/relaunch resilient; no runtime process-kill test was performed.

**Suggested fix:** If continuity is required, persist a task/session deadline and extension metadata (or deliberately reset the session and tell the user). Add navigation/background/process-recreation tests.

### 8. MEDIUM — Task status changes and outcome-history writes are separate operations

**Evidence:** Start writes status and outcome in sequence (`app/task/[id].tsx:122-132`); done does likewise (`:77-89`). Stop writes `stopped` before setting the task to pending (`app/task/focus.tsx:69-78`). In the store, each call independently updates state/database (`lib/store/task-store.ts:97-115,134-140`); no combined transaction spans the status and outcome writes.

**Impact:** If the second write fails, the user can be left with a persisted status but missing/mismatched history (or a history event with the old status). Since focus detection uses that history, partial failures can change future nudges. Existing catch blocks show an error/navigation fallback, but they cannot roll back the preceding successful database operation.

**Suggested fix:** Persist lifecycle transition plus outcome atomically in one database/store operation, or add compensating rollback/reconciliation. Exercise injected failures between each write.

### 9. MEDIUM — Jest cannot execute the focused timer suite in this checkout; detection/overlay coverage is absent

**Evidence:** The only focus-related test found is `lib/ai/__tests__/focus-timer.test.ts:1-22`, covering pure time formatting/deadline helpers. No tests were found for `lib/focus/detection-engine.ts`, `FloatingBubble`, the link/permission path, service manifest integration, or focus-screen lifecycle. Running `npm test -- --runInBand lib/ai/__tests__/focus-timer.test.ts` failed before tests ran: Babel reported duplicate plugins for `react-native-worklets/plugin` and `react-native-reanimated/plugin`, both configured at `babel.config.js:20-22`.

**Impact:** There is no passing test evidence for the timer in this run, and the relevant end-to-end integrations lack automated coverage. This is a test-runner/configuration failure, not evidence that a particular UI behavior fails at runtime.

**Suggested fix:** Resolve the Babel plugin duplication for the installed React Native/Reanimated versions, then add unit tests for the scoring thresholds and component/integration tests for bubble state, link dispatch, permission denial, and notification updates. Keep a generated-Android-manifest/device test for native activity/service wiring.

### 10. LOW — Detection storage failures are silently treated as “no signal”

**Evidence:** `lib/focus/detection-engine.ts:39-45` catches every outcome-query/scoring error and returns `{kind:"none"}` with no logging or UI notice.

**Impact:** A storage/migration failure looks exactly like a normal no-nudge result, making degraded focus detection difficult to diagnose. The feature is advisory and this avoids interrupting a session, so impact is limited.

**Suggested fix:** Preserve the calm fallback but log/report a non-user-blocking diagnostic, and test the storage-failure path.

## What is sound in source (not runtime-verified)

- Task detail starts focus by persisting `active`, recording `started`, then navigating to the focus route (`app/task/[id].tsx:122-128`).
- Focus timing uses a deadline rather than decrementing stored state, and `lib/ai/focus-timer.ts` clamps negative time and rounds partial seconds upward; the existing test file documents these intended helper cases.
- The detection query is task-scoped and newest-first (`lib/storage/database.ts:966-984`); the engine has no background process or screen-monitoring code and explicitly says it uses local task outcomes (`lib/focus/detection-engine.ts:1-8`).
- Android config declares `RECORD_AUDIO`, `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, and `FOREGROUND_SERVICE_SPECIAL_USE` (`app.json:17-28`). The config plugin statically copies native sources and registers a non-exported voice activity and a special-use foreground service (`plugins/with-system-actions.js:30-86,188-201,237-260`). The generated manifest and actual Android build were not inspected/verified.
- The explicit Android widget-to-voice-activity intent path is present (`BeginoraWidgetProvider.kt:52-59`), distinct from the unresolved app/bubble deep-link path.
- Task activity is local SQLite history; explicit task deletion also deletes its outcome rows (`lib/storage/database.ts:986-992`), and the task-detail confirmation copy tells the user that local activity will be removed (`app/task/[id].tsx:172-185`).

## Validation performed and limits

- `npm run typecheck -- --pretty false`: failed with unresolved `@expo/vector-icons` in the bubble and voice button, unresolved `expo-av` in voice input, and a separate `lib/ai/decomposer.ts:23` type error.
- `npm test -- --runInBand lib/ai/__tests__/focus-timer.test.ts`: suite did not execute due Babel's duplicate Worklets/Reanimated plugin error; **zero tests ran**.
- No app launch, microphone permission prompt, Android manifest generation, notification drawer, overlay interaction, backgrounding, process death, iOS behavior, or physical-device/emulator test was performed.

Beginora is a planning/focus aid, not medical diagnosis or treatment; this review evaluates code integration only.
