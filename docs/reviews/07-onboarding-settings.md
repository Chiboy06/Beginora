# Beginora onboarding, settings, routes, and update UX — static audit

**Reviewed checkout:** `/home/ubuntu/Beginora-latest`, `origin/main` / `HEAD` `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`feat: app update`).
**Scope:** onboarding, root/tab navigation, settings and connector entry points, voice/audio permission handoff, local notification permissions, EAS update UX/configuration, plus directly related service/native code and tests.
**Method:** source/config/test inspection only. No source edits, migrations, builds, device/emulator runs, or tests were run. No `.env` file was read. The worktree was clean before/after review.

## Overall assessment: **Partial / not runtime-verified**

The code has a coherent consent-oriented design in several places: onboarding contains the requested non-clinical disclaimer; connector status checks do not themselves prompt for permissions; calendar reads are bounded; reminder scheduling is initiated by a user action; and the update service has a narrow, defensive status API with unit tests. However, the initial onboarding gate appears unable to transition out of its redirect state, voice input is not fully wired to the native activity and imports an undeclared module, Telegram’s privacy/storage posture conflicts with the absolute onboarding copy, appointment reminders can become stale after event rescheduling, and OTA delivery is deliberately not connected until project setup and currently targets preview only. These conclusions are based on source/config evidence, not observed device behavior.

## Findings

### High — Onboarding completion does not update the root gate

**Evidence:** `app/_layout.tsx:22-23,25-33` stores `needsOnboarding` in local React state and sets it once from `prefs.onboardingDone` after initialization. At `app/_layout.tsx:67-74`, when that state is true the root layout returns a `<Redirect href="/onboarding" />` instead of mounting its `<Stack>`. The onboarding action at `app/onboarding.tsx:9-12` writes the synchronous MMKV preference and immediately calls `router.replace("/(tabs)")`, but it never updates the parent layout’s `needsOnboarding` state.

**Impact:** On a first run, navigating from onboarding to tabs leaves the mounted root layout with `needsOnboarding === true`; it can continue redirecting to onboarding. In addition, the onboarding branch does not render the root navigator that declares the onboarding route (`_layout.tsx:76-109`). This is a static control-flow defect; first-run route behavior was not exercised on device.

**Suggested fix:** Keep the root navigator mounted in all auth/onboarding states and gate routes within it (or make the gate reactive and explicitly clear it when onboarding completes). Add a first-launch → continue → tab → cold-restart route test.

### High — Voice permission module imports an undeclared `expo-av` dependency

**Evidence:** `lib/native/voice-input.ts:6-8` imports `expo-av` and calls `ExpoAV.Audio.requestPermissionsAsync()` at lines 15-20. That module is imported by `components/VoiceButton.tsx:4`; `components/ChatInput.tsx:10,46-50` renders the button, and `app/index.tsx:279-285` uses the chat input. `package.json:18-52` lists the app dependencies but not `expo-av`; the checked-in `package-lock.json` likewise has neither a root `expo-av` dependency nor a `node_modules/expo-av` entry.

**Impact:** A clean install cannot satisfy this direct import. Metro bundling/typechecking may fail for the app bundle, not just disable the mic, because the import is on the primary chat screen’s module graph. No clean-install build was run, so the precise build error was not observed.

**Suggested fix:** Add a compatible direct dependency and lockfile entry, or replace the permission call with an installed supported API/native module. Verify a clean `npm ci` followed by Android bundle/build and a permission-denied test.

### High — UI voice links do not dispatch to the registered native voice activity

**Evidence:** `components/VoiceButton.tsx:28-30` launches `Linking.openURL("beginora://voice")`; the floating bubble independently does the same at `components/FloatingBubble.tsx:79-83`. The native activity is registered by `plugins/with-system-actions.js:188-201` with `android:exported="false"` and **no intent filter**. The activity itself starts the speech-recognition intent at `native/android/src/main/java/app/beginora/android/BeginoraVoiceActivity.kt:54-67`. The widget is the only inspected path that starts it explicitly (`BeginoraWidgetProvider.kt:52-59`). The app declares the `beginora` scheme in `app.json:9`, but the route list has no voice screen; the chat return handler is in `app/index.tsx:120-148` and expects `beginora://chat?voice_text=...`.

**Impact:** A URI-based `Linking.openURL` is not an explicit `Intent(this, BeginoraVoiceActivity::class.java)` call, and the registered activity cannot match `beginora://voice` without an intent filter. The chat-button path therefore has no static route to the native recognizer; the cold-return path also needs a route/deep-link test because `/chat` is not a distinct screen in the checked-in route tree. The widget’s explicit native entry is a separate path and does not prove the React Native button works.

**Suggested fix:** Launch the native activity through a native module/API, or add a deliberate URI intent-filter/route that safely targets it. Ensure the returned transcription is routed to the mounted chat screen on both foreground and cold start. Add native intent-resolution and deep-link tests. Keep the Android-only limitation explicit (the JS permission service returns false off Android at `voice-input.ts:16-18,27-35`).

### Medium — Onboarding makes an absolute privacy promise contradicted by opt-in integrations

**Evidence:** `app/onboarding.tsx:27-31` says “Nothing is sent to a server.” Settings also says at `app/settings.tsx:251` that the prototype keeps data on-device. But settings offers Telegram at `app/settings.tsx:412-416,453-460`, and `lib/telegram/telegram-service.ts:44-63` posts to `https://api.telegram.org/.../sendMessage`; task summaries are sent from a user-facing task detail action (`app/task/[id].tsx:323-331`, service `telegram-service.ts:70-81`). Email handoff is also disclosed in the connector page (`app/connectors.tsx:43-45`) and registry (`lib/connectors/registry.ts:23-33`). These are user-triggered/opt-in flows, but they disprove the unqualified onboarding statement.

**Impact:** A first-run user can reasonably understand the privacy copy as applying to all functionality, then later enable or use an integration that sends content off-device. This is a consent/transparency risk, not evidence of silent transfer.

**Suggested fix:** Distinguish local core task storage/inference from optional user-selected services: e.g., “Core tasks stay on this device; if you enable an integration, only the information you choose may be sent to that service.” Reconcile the onboarding and settings copy and retain clear per-action consent.

### Medium — Telegram bot token is stored in the general SQLite config table

**Evidence:** The token field is visually masked (`app/settings.tsx:431-442`), but `lib/telegram/telegram-service.ts:31-36` persists the raw token with `setConfig(KEY_TOKEN, cfg.botToken.trim())`. The general `config` table is `key TEXT PRIMARY KEY, value TEXT NOT NULL` in `lib/storage/database.ts:241-244`; the settings screen later reads it back through `getTelegramConfig` (`telegram-service.ts:18-29`). `expo-secure-store` is configured as a plugin in `app.json:42-48`, but this token path does not use it.

**Impact:** Masking protects against casual shoulder-surfing only; it does not provide app-level secret storage. A copied/debugged database or a compromised device could expose a bot credential that can act as that bot. No database encryption was verified.

**Suggested fix:** Store the bot token in SecureStore (or another platform-backed secret facility), keep non-secret chat configuration separately, and provide a clear remove/disable control. Do not log the token or include it in diagnostics.

### Medium — Rescheduled calendar events can leave an orphaned reminder

**Evidence:** `lib/native/appointment-reminders.ts:27-29` builds the persistence key from both event ID and start time. `scheduleAppointmentReminder` reads only that key (`:70-77`), then persists a new ID and cancels a prior notification only if an `existing` record was found under that same key (`:83-96`). If an event retains its ID but moves to a new start time, the lookup key changes, so the old scheduled notification is not found/cancelled. The calendar screen disables the button once its currently displayed event is marked reminded (`app/calendar.tsx:124-133`), but has no cancel/edit-reminder action. Current unit coverage tests changing a lead time for the same start (`lib/native/__tests__/appointment-reminders.test.ts:77-84`), not event rescheduling.

**Impact:** A user may receive a notification for the old appointment time in addition to the new one, or an obsolete reminder after the event changes. This is a reminder-correctness/data-retention issue; no device schedule was inspected.

**Suggested fix:** Index reminder records by stable event identity, detect start-time changes, and cancel/replace the prior notification only after the new record is safely persisted. Add reschedule, deletion, permission-denial, and cancellation tests/UI.

### Medium — OTA is intentionally unavailable until linking, and publishing is preview-only

**Evidence:** `app.config.ts:4-15` enables `expo-updates` only when `EAS_PROJECT_ID` exists; without it, config is `{ enabled: false }`. The checked-in profiles define channels in `eas.json:7-14,33-40`, but do not set `EAS_PROJECT_ID`. `docs/OTA_UPDATES.md:20` explicitly states there is no EAS project ID or Expo token configured in this workspace. The workflow is additionally gated by the `EAS_UPDATES_ENABLED` repository variable (`.github/workflows/eas-update.yml:13-19`) and always publishes `preview` (`:39-40`). A production build embeds the `production` channel (`eas.json:33-40`), so the current workflow will not deliver its preview updates to production binaries. Settings copy does identify the preview channel and native-update limitation (`app/settings.tsx:267-280`); the service returns a usable `unavailable` message when updates are disabled (`lib/updates/update-service.ts:10-22`).

**Impact:** The Settings action is wired but does not currently provide OTA updates in an unlinked binary; and, even after setup, the checked-in workflow services preview only. This is an operationally partial feature, not evidence that external GitHub variables/secrets were inspected (they were not).

**Suggested fix:** Complete EAS project linking and publish a newly built preview binary with the matching runtime/channel. Keep preview-only messaging, or add an explicitly protected production publishing workflow if production OTA is intended. Exercise the real installed binary/update channel and rollback/reload behavior before describing updates as active.

### Low — Connector badges can mislabel permission and pairing state

**Evidence:** `lib/connectors/permission-service.ts:8-10` reports `not_requested` whenever permission is not granted but `canAskAgain !== false`; a prior denial that remains askable can therefore appear as “Not requested.” `app/connectors.tsx:19-26` renders `denied` and `revoked` labels, but the service never returns `revoked` and only returns `denied` for a non-grant with `canAskAgain === false`. It also hardcodes `"paired-mcp": "not_requested"` at `permission-service.ts:30-37`, rather than reflecting server/pairing state. The page refreshes status on mount/focus (`connectors.tsx:32-37`) and routes each card (`:10-17,46-53`), so the issue is the displayed status model, not a missing screen mapping.

**Impact:** A user may see stale or inaccurate readiness text after denying a permission or enabling MCP. It can undermine the promise that the status badge tells them what is actually connected.

**Suggested fix:** Model OS permission status separately from whether it is askable, and provide a state source for MCP server/pairing status; remove unreachable labels if those states are not implemented. Add permission-state mapping tests.

### Low — Reminder timing uses best-effort delivery without a timing disclosure

**Evidence:** `lib/native/reminders.ts:62-69` schedules a `DATE` trigger without specifying `delivery`. The installed Expo Notifications type defines the default as `bestEffort` (`node_modules/expo-notifications/src/Notifications.types.ts:140-150,390-398`) and says Android OEMs may defer delivery by minutes, particularly without exact-alarm access. The code intentionally declares `POST_NOTIFICATIONS` in `app.json:17-27` but does not declare exact-alarm access; `expo-notifications`’ own manifest adds `POST_NOTIFICATIONS`/boot handling but not exact-alarm access (`node_modules/expo-notifications/android/src/main/AndroidManifest.xml:1-4`). This path does not request the stricter `alarmClock` mode.

**Impact:** Scheduling can be correctly accepted but still deliver later than the selected minute on some Android devices. This is not a finding that scheduling always fails; best-effort appears deliberately less privileged and is appropriate for non-critical reminders, but Settings/calendar UX does not disclose timing tolerance.

**Suggested fix:** State that reminders are best-effort and may be delayed. Only if product requirements demand alarm-clock precision, add the appropriate Android permission/access rationale and test that special-access flow; do not silently upgrade reminders to time-critical alarms.

## Verified sound from static evidence (not device verification)

- The onboarding and Settings both state the non-medical boundary: `app/onboarding.tsx:34-38` and `app/settings.tsx:283-287` say the app does not diagnose or treat ADHD and does not replace professional support.
- Onboarding completion is stored synchronously in MMKV (`lib/store/prefs.ts:29-34`), so a successful write is immediately readable; the defect is that the root’s copied React state is not updated.
- The “Confirm actions” setting persists `confirm_destructive_actions` (`app/settings.tsx:77-85`); orchestration reads that same DB key with default-on behavior (`lib/orchestrator/orchestrator.ts:77-90`), and the tool registry gates destructive tools only when that setting and tool policy require it (`lib/tools/tool-registry.ts:272-284`).
- Connector status inspection uses `Promise.allSettled` over permission/availability reads and does not request OS permissions (`lib/connectors/permission-service.ts:13-38`). The page refreshes on focus (`app/connectors.tsx:32-37`). The route map includes calendar, reminders, email, documents, model, and MCP destinations (`app/connectors.tsx:10-17`); the root stack declares the corresponding utility screens (`app/_layout.tsx:94-108`). This confirms source-level reachability mappings, not successful router execution.
- Calendar access is requested only after invoking a calendar feature (`lib/native/calendar.ts:18-24`); upcoming event reads are bounded to a maximum 90-day window and 50 results, with the UI asking for 30 days/12 events (`calendar.ts:26-38`, `app/calendar.tsx:37-45`). Denial leaves a manual path (`calendar.tsx:140-150`).
- Notification setup is action-driven: `scheduleAppointmentReminder` leads through `scheduleLocalReminder`, which configures a local channel and requests notification permission only when the reminder is being scheduled (`appointment-reminders.ts:77-81`, `reminders.ts:11-35,54-70`). Appointment reminder tests cover valid/invalid timing, denial-relevant scheduling delegation, deduplication, safe replacement ordering, and all-day rejection (`lib/native/__tests__/appointment-reminders.test.ts:30-90`).
- The update service is separated from the Settings UI, avoids checks in dev or when disabled, fetches only an available update, and returns a safe failure message (`lib/updates/update-service.ts:9-43`). Unit tests cover no-update, download/reload, disabled service, and error outcomes (`lib/updates/__tests__/update-service.test.ts:13-44`).

## Test gaps and review limits

- No onboarding gate/continue test; especially missing first-run route test and persistence across restart.
- No tests for `VoiceButton`, microphone permission denial, native activity URI resolution, recognizer cancellation/unavailability, transcription return while app is open, or cold-start deep link. No Android build/device evidence was collected.
- No permission-service tests for denied-but-askable, permanently denied, unavailable modules, revoked state, or MCP pairing state; no connector route integration test.
- No unit tests for `scheduleLocalReminder` permission rejection, notification-channel/scheduler exceptions, Android timing mode, or UI permission UX; appointment test misses changed/deleted event cleanup.
- No end-to-end test connecting Settings → EAS enabled/disabled messages to a built binary on preview and production channels, or validating workflow credentials/variables. Repository secrets/variables and any `.env` values were intentionally not inspected.
- No runtime claim is made for Android/iOS permissions, Expo Router behavior, exact notification delivery timing, native build success, or OTA availability. No tests/builds were run as requested for a static review.
