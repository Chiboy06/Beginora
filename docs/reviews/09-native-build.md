# Beginora native build, permissions, and CI audit

**Reviewed checkout:** `/home/ubuntu/Beginora-latest`, `origin/main` snapshot requested at commit `6e20db88852138cd7bdba6a9c62c7434a76545fa` (working branch `fix/integrate-latest-updates`).
**Scope:** native configuration, dependencies, config plugins, Android native bridge sources, EAS configuration, CI, and directly related permission/notification/connector call paths and tests.
**Method:** static source/configuration review only. No `.env` files were read. No app source/config was changed; this report is the only requested output. No build, install, migration, test suite, or device run was performed, so runtime behavior is not claimed.

## Executive summary

**Status: broken for a clean CI/build path, with additional partially integrated features.** The manifest and Expo-managed dependency versions are largely coherent, and local calendar/reminder permission flows have useful bounded behavior and unit tests. However, `npm ci` installs neither `expo-av` nor `@expo/vector-icons`, although the source imports them; the CI workflow then runs TypeScript checking. The chat mic also launches a `beginora://voice` URL that is not routed to the registered native voice activity. A separate Android widget path does explicitly launch that activity, so voice is not wholly absent, but the main in-app voice entry point is not connected.

The most significant privacy issue is the paired MCP connector: the UI/registry describe source-level opt-in, but the native HTTP endpoint and JS allowlist expose every registered read-data tool to each paired client. The endpoint binds all IPv4 interfaces and uses plain HTTP bearer tokens. Connector permission reporting also omits contacts/microphone and labels a still-askable denial as “Not requested.”

The Expo SDK 58 managed-native versions present in the lockfile match the installed SDK 58 compatibility map for the inspected Expo/RN packages. That does **not** establish that Android prebuild, custom plugin injection, Gradle resolution, signing, or on-device behavior succeeds; CI has no native build job.

## End-to-end path traces

### Voice/audio

- `ChatInput` renders `VoiceButton` (`components/ChatInput.tsx:46-50`). The button calls `requestMicPermission` (`components/VoiceButton.tsx:15-30`), which imports `expo-av` and requests its audio permission (`lib/native/voice-input.ts:7,16-20`), then opens `beginora://voice` (`components/VoiceButton.tsx:28-30`).
- The config plugin declares `.BeginoraVoiceActivity` in the manifest (`plugins/with-system-actions.js:188-201`). The activity requests `RECORD_AUDIO`, starts Android `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`, and on a result opens `beginora://chat?voice_text=...` (`BeginoraVoiceActivity.kt:22-35,54-65,69-86`). `app/index.tsx:120-137` consumes only the `chat` host or `/chat` path and places `voice_text` into the chat input.
- There is no intent filter connecting `beginora://voice` to `BeginoraVoiceActivity` in the plugin, and the chat deep-link handler does not handle a `voice` route. The separate widget path is explicit: `BeginoraWidgetProvider.kt:52-59` creates a `PendingIntent` directly to `BeginoraVoiceActivity`.
- The native recognizer is the Android system recognition intent, not the app’s local LLM. The source does not establish whether the selected recognizer processes audio locally or remotely.

### Connectors and permissions

- The calendar screen calls `getUpcomingCalendarEvents`; the adapter checks/request calendar permission on use, bounds the look-ahead window and event count, and returns a manual-use fallback (`app/calendar.tsx:37-62`; `lib/native/calendar.ts:18-24,26-42`). Calendar tests cover invalid bounds, denial, sorting, deduplication, and caps (`lib/native/__tests__/calendar.test.ts:18-59`).
- Contact tools call `Contacts.requestPermissionsAsync()` and query selected name/phone fields (`lib/native/contacts.ts:11-14,19-20,43-65`). The manifest declares `READ_CONTACTS` (`app.json:17-28`), but the connector registry/status screen has no contacts connector.
- Local reminders request notification permission only when a reminder is scheduled and create the Android `reminders` channel (`lib/native/reminders.ts:11-35,43-74`; `app.json:22,42-47`). Appointment reminder state is stored locally and the helper cancels the old notification only after a replacement has been scheduled and persisted (`lib/native/appointment-reminders.ts:77-96`); tests cover timing, duplicates, persistence, and all-day events (`lib/native/__tests__/appointment-reminders.test.ts:30-91`).
- Android alarms/calendar inserts use the custom `SystemActionsModule`; calendar creation opens an editor rather than writing silently (`lib/native/system-actions.ts:113-139`; `SystemActionsModule.kt:118-139`). `SystemActionsPackage.kt:10-17` includes the system-actions, foreground-service, and MCP modules.

### MCP connector

- The MCP screen enables/disables the server and creates/revokes clients (`app/mcp.tsx:40-90`). The lifecycle installs a JS listener, pushes active tokens, starts the native server, and persists the enabled bit (`lib/mcp/mcp-lifecycle.ts:19-38`). The native module receives authenticated requests and bridges them to JS (`McpServerModule.kt:20-62`; `lib/native/mcp-server.ts:37-52`), where the JSON-RPC handler calls read-only tools (`lib/mcp/mcp-server.ts:55-66`).
- “Read-only” is not the same as per-source authorization: the tool list is constructed from **all** tools marked `returnsData`, and there is no per-client source grant in the screen or dispatcher path (`lib/mcp/mcp-tools.ts:15-25,32-45`).

## Findings

### 1. **Blocker — Clean dependency installation omits packages imported by application code**

**Evidence:** `lib/native/voice-input.ts:7,18` imports `expo-av`; `components/VoiceButton.tsx:3` and `components/FloatingBubble.tsx:24` import `@expo/vector-icons`. Neither package appears in the dependency lists in `package.json:18-65` or the lockfile root dependency set in `package-lock.json:11-58`; neither is resolved in the lockfile. The installed Expo 58 compatibility metadata offers `expo-audio ~58.0.8`, not `expo-av`. CI runs `npm ci --legacy-peer-deps` and then `npm run typecheck` (`.github/workflows/ci.yml:25-30`).

**Impact:** A clean checkout does not install the imported modules; TypeScript/Metro resolution is expected to fail before a usable app bundle is produced. Voice permission setup also relies on the missing, non-SDK-mapped audio package.

**Suggested fix:** Add and lock the supported SDK 58 audio package/API (or remove the unused JS permission dependency and use an explicit native permission bridge), and add/lock `@expo/vector-icons`; validate with clean `npm ci` plus `npm run typecheck` and an Android bundle build.

**Confidence:** High.

### 2. **High — Main chat voice button does not dispatch to the native voice activity**

**Evidence:** `components/VoiceButton.tsx:21-30` requests permission and opens `beginora://voice`. `plugins/with-system-actions.js:188-201` registers `BeginoraVoiceActivity` but adds no matching scheme/host intent filter or callable native method. `app/index.tsx:120-137` consumes `chat`/`/chat` links only. In contrast, the widget explicitly targets the activity (`BeginoraWidgetProvider.kt:52-59`).

**Impact:** Even after dependency resolution, pressing the primary chat mic does not invoke the native speech-recognition activity through the code shown. The Android widget’s explicit activity path is distinct and may reach it; no device evidence was collected. Also, `listening` is reset as soon as `Linking.openURL` resolves (`VoiceButton.tsx:26-35`), so it cannot represent recognizer completion.

**Suggested fix:** Use an explicit native `startVoiceRecognition` method/intent for the app button or provide a tested deep-link route that dispatches to the activity. Keep the UI state tied to actual result/cancel events and add routing tests for the returned transcript.

**Confidence:** High.

### 3. **High — MCP “source-level opt-in” is not enforced; every paired client gets all read-data tools**

**Evidence:** The connector descriptor promises “only the individual read-only source you enable” (`lib/connectors/registry.ts:75-85`), but `app/mcp.tsx:92-131` offers only a global server switch and client creation/revocation—no source controls. `lib/mcp/mcp-tools.ts:15-25` publishes every `MVP_TOOLS` entry with `returnsData === true`, and `callReadTool` accepts any such tool (`:32-45`). That set includes contacts, calendar, and imported-document queries (`lib/tools/tool-registry.ts:163-179,217-245`).

**Impact:** Pairing a client grants it a broader read scope than the UI and registry describe; a client can request contacts, calendar events, and document search, subject to the app’s OS permissions/local data. This is a data-minimization and consent mismatch even though MCP mutations are excluded.

**Suggested fix:** Implement per-client/per-source allowlists enforced in `callReadTool` (not just UI), make scopes visible during pairing and revocation, and add tests proving denied sources cannot be listed or called. Otherwise change the promise and require explicit broad-scope consent.

**Confidence:** High.

### 4. **High — MCP bearer-token traffic is plaintext and the server listens on all IPv4 interfaces**

**Evidence:** `McpHttpServer.kt:9-13` binds NanoHTTPD to `0.0.0.0`; it accepts a `Bearer` token from the `Authorization` header (`:22-30`). The client setup exposes an `http://` endpoint and copies the bearer token into the pairing command (`app/mcp.tsx:58-69`), while the UI says “Only reachable on this Wi-Fi” (`:101-105`).

**Impact:** The service is not interface-restricted to Wi-Fi by the shown code. Any interface/network that can route to the device can reach the listener; a paired client’s token is also unencrypted in transit and could be observed on an untrusted local network. The token check prevents unauthenticated requests but does not protect a leaked bearer token. Actual reachability depends on device/network routing.

**Suggested fix:** Use an authenticated encrypted transport or another protected pairing channel; bind to an explicitly selected interface where feasible; constrain/rate-limit request bodies and concurrent pending requests; and make the UI accurately state the endpoint’s exposure. Keep the existing token check and revocation behavior.

**Confidence:** High for wildcard bind/plain HTTP; medium for exposure on any particular external network.

### 5. **Medium — Connector permission dashboard mislabels denials and omits contacts/microphone**

**Evidence:** `lib/connectors/permission-service.ts:8-10` maps a denial to `not_requested` whenever `canAskAgain !== false`, even if the OS status is already denied. Its returned map contains calendar, notifications, email, documents, model, and MCP only (`:30-37`). Contacts are requested at use (`lib/native/contacts.ts:11-14`), and `READ_CONTACTS`/`RECORD_AUDIO` are declared in `app.json:21,25`; `lib/tools/tool-registry.ts:163-179` exposes contact search. `app/connectors.tsx:10-17,46-67` renders only the registry entries.

**Impact:** A user who denied calendar/notification permission but can still be prompted sees “Not requested,” and there is no connector/status/disclosure entry for address-book access or voice permission. This weakens informed control over access to personal contacts and microphone.

**Suggested fix:** Map the OS `status` separately from `canAskAgain`; add contacts and voice/audio entries with purpose, access timing, denial recovery, and data-flow disclosure; test granted, denied-but-askable, permanently denied, unavailable, and revoked states.

**Confidence:** High.

### 6. **Medium — Foreground service starts during chat-store initialization and notification status can contain task titles**

**Evidence:** `lib/store/chat-store.ts:105-128` starts the foreground service from `init`; there is no user opt-in at that call site. `components/FloatingBubble.tsx:45-54` passes the active task title into the service notification. `BeginoraService.kt:68-84` places the supplied status in the ongoing notification, and the config plugin declares `specialUse` with an AI-model-in-memory subtype (`plugins/with-system-actions.js:237-260`). `POST_NOTIFICATIONS`, foreground-service, and special-use permissions are declared (`app.json:22-27`).

**Impact:** The app creates a persistent special-use service even when a user has not deliberately enabled a background feature; it may consume resources and requires Android/Play policy review for the declared use. Notification content may expose a task title depending on device lock-screen/notification settings; no explicit public/redacted version is configured. The service code itself only manages its notification (`BeginoraService.kt:29-50,68-91`), so the claim that it keeps the model loaded is not verified by native code or device evidence.

**Suggested fix:** Make persistent background operation an explicit, reversible setting or scope it to active user work; use generic/redacted notification text by default; provide a stop path; validate the `specialUse` justification against current Android distribution policy; and test process/background/notification-permission behavior on supported Android API levels.

**Confidence:** High for automatic start and task text; medium for user-visible lock-screen exposure and policy outcome.

### 7. **Medium — Voice transcription is not guaranteed to remain offline**

**Evidence:** `BeginoraVoiceActivity.kt:54-62` launches `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` through Android’s selected recognition activity and sets no offline preference. `app.json:37-38` provides microphone/speech-recognition purpose text, but the voice UI and service source do not explain that an OS/provider may process recognition remotely.

**Impact:** Offline-first positioning cannot be extended to voice transcription based on this implementation. Depending on the installed recognition provider/settings, audio or transcript processing may leave the device; this review cannot determine the provider’s behavior or prove that it does so.

**Suggested fix:** Disclose the system-recognizer handoff before first use, state whether connectivity may be required, and use an on-device recognizer if offline-only processing is a requirement. Do not represent this path as local inference without provider-specific evidence.

**Confidence:** Medium.

### 8. **Medium — Native package registration is fail-open and CI never exercises prebuild/Gradle**

**Evidence:** `plugins/with-system-actions.js:121-150` attempts a small set of `MainApplication` text patterns and only warns if registration cannot be inserted; it does not fail prebuild. The matching comment identifies an SDK 55/RN 0.83 shape, while the lockfile selects RN `0.88.0-rc.4` (`package.json:44-50`; `package-lock.json:37-43`). CI runs install, typecheck, lint, audit, and Jest only (`.github/workflows/ci.yml:25-39`); no Expo prebuild, manifest inspection, Android compile, or APK/AAB build is present. No tracked generated `android/` project exists.

**Impact:** A future Expo/RN template change can produce a successful config pass but omit `SystemActionsPackage`, leaving alarm, service, and MCP native modules unavailable. Current registration against the generated RN 0.88 template was not established in this static review.

**Suggested fix:** Make failure to find/insert package registration a prebuild error, add config-plugin snapshot/assertion tests for the locked Expo/RN template, and add a native Android build smoke job that checks generated manifest entries and module registration.

**Confidence:** High that failure is fail-open and CI omits native build; medium that the current template mismatches.

### 9. **Medium — EAS OTA wiring is conditional and only automates preview publication**

**Evidence:** `app.config.ts:4-15,21-22` enables `expo-updates` and `runtimeVersion` only when `EAS_PROJECT_ID` is present. `app.json:72-74` has no static `extra.eas.projectId`. `eas.json:6-40` sets preview/production channels but does not set `EAS_PROJECT_ID`; the separate GitHub workflow is gated on `vars.EAS_UPDATES_ENABLED`, requires external `EAS_PROJECT_ID`/`EXPO_TOKEN`, and always publishes `--channel preview` (`.github/workflows/eas-update.yml:14-19,29-40`).

**Impact:** Builds without the external project variable deliberately disable OTA updates, and the checked-in workflow does not publish to the production channel used by the production build profile. This may be an intentional safe default; repository state alone cannot establish whether EAS/GitHub environment variables are configured (secrets were not inspected).

**Suggested fix:** Document and validate the required EAS project/environment configuration, add an explicit production-channel release path if production OTA is intended, and add a config validation step ensuring each build profile’s channel/runtime version aligns with the publishing workflow.

**Confidence:** High for checked-in conditional/preview-only wiring; medium for whether it is active in the user’s external EAS environment.

### 10. **Low — Android signing plugin is present but not applied by app configuration**

**Evidence:** `plugins/with-android-signing.js:33-64` implements Gradle signing injection, but `app.json:42-70` registers `./plugins/with-system-actions` and not `./plugins/with-android-signing`; `app.config.ts:17-34` spreads the existing Expo config without adding it. The plugin comment references `.github/workflows/release.yml` (`plugins/with-android-signing.js:5-12`), while the tracked workflows are only `ci.yml` and `eas-update.yml`.

**Impact:** The custom env-driven signing injection never runs through the checked-in app config. This does not prove EAS-managed signing is broken; it means the stated custom signing workflow is not integrated here.

**Suggested fix:** Either register the plugin and add a real, protected release workflow with the expected Gradle properties, or remove the dormant plugin/reference and document reliance on EAS-managed signing.

**Confidence:** High.

### 11. **Low — Generic reminder replacement can cancel an existing reminder before replacement succeeds**

**Evidence:** `lib/native/reminders.ts:43-47,59-69` cancels `replaceIdentifier` before calling `scheduleNotificationAsync`. Its error path returns failure (`:71-73`) without restoring the canceled reminder. Appointment reminders currently avoid this ordering by scheduling/persisting first and canceling the old ID afterward (`lib/native/appointment-reminders.ts:77-96`); no current call site was found that supplies `replaceIdentifier`.

**Impact:** The optional generic replacement path could lose an already-scheduled notification if replacement scheduling fails; this is a latent API/data-loss risk, not an observed current user path.

**Suggested fix:** Schedule and persist the replacement first, then cancel the old ID, or roll back on error; add permission-denied/schedule-failure/replacement tests.

**Confidence:** High for the code ordering; low for current user impact because the parameter has no discovered caller.

## Verified sound / partially sound areas

- **Expo SDK pairing:** `package.json:21-50` and the lockfile’s resolved root (`package-lock.json:14-43`) align with the installed Expo 58 module compatibility map for Expo Calendar, Contacts, Notifications, Router, Updates, React, React Native, Reanimated, safe-area context, and screens. This is package metadata evidence, not a native build result.
- **Permission declarations:** Android explicitly declares calendar read/write, contacts read, notification, foreground-service/special-use, microphone, vibration, and boot permissions (`app.json:17-28`). iOS includes calendar/contact/microphone/speech/reminder usage text (`app.json:30-40`); actual access still depends on the feature and OS prompt.
- **Calendar reads:** permission is requested only for the calendar action; the adapter limits the window to 1–90 days and the result count to 1–50 (`lib/native/calendar.ts:18-42`). Tests verify denial and bounded/deduplicated results (`lib/native/__tests__/calendar.test.ts:26-59`).
- **Reminders:** notification permission is requested at the user-triggered scheduling point; reminders use the Android channel and date triggers (`lib/native/reminders.ts:11-35,54-70`). Appointment reminder storage rollback and old-ID cancellation ordering are covered structurally and by tests (`lib/native/appointment-reminders.ts:77-96`; test cases `lib/native/__tests__/appointment-reminders.test.ts:60-90`). Exact alert timing/background delivery remains unverified on a device.
- **MCP auth/lifecycle basics:** the native handler checks a bearer token against active tokens before reading/dispatching a request (`McpHttpServer.kt:26-33`); token generation uses 24 random bytes (`lib/mcp/pairing-store.ts:22-27`, global polyfill loaded by `index.ts:1`). Client revocation refreshes the active token set (`lib/mcp/pairing-store.ts:69-72`). Unit tests cover lifecycle and the JS/native event mock (`lib/mcp/__tests__/mcp-lifecycle.test.ts:18-40`; `lib/native/__tests__/mcp-server.test.ts:33-62`), but not the Kotlin socket server.
- **EAS updater fallback:** update checks safely report unavailable when updates are disabled and catch update/network errors (`lib/updates/update-service.ts:9-43`); unit tests cover disabled and error cases (`lib/updates/__tests__/update-service.test.ts:33-43`).

## Test and verification gaps

1. No tests cover the `VoiceButton` → permission → `beginora://voice` dispatch, Android `BeginoraVoiceActivity` permission/result/cancel lifecycle, transcript return routing, or Expo AV/audio package resolution.
2. No contact-permission/dashboard tests cover denied-but-askable versus permanently denied states or contacts visibility in connector settings.
3. Notification tests exercise appointment timing/persistence but not `scheduleLocalReminder` permission denial, channel initialization, schedule failure, cancellation failure, or replacement rollback.
4. MCP tests mock native modules; none exercise NanoHTTPD authentication over a socket, interface binding, request-size limits, multi-source authorization, token exposure, or stop/restart behavior.
5. No config-plugin tests assert generated manifest components, `MainApplication` registration, NanoHTTPD dependency injection, or Gradle signing behavior.
6. `.github/workflows/ci.yml` has no Android prebuild/compile/package step and no Expo config/SDK compatibility command. No build/device evidence was collected in this review.
7. The installed SDK metadata indicates `expo-audio ~58.0.8` as the supported audio package, but neither it nor `expo-av` is declared; the declared `react-native` prerelease matches the installed SDK map, but native build compatibility remains unverified.

## Review conclusion

Treat the clean-install typecheck and app mic path as release-blocking until the missing dependencies and voice dispatch are repaired. Before enabling MCP for real data, align the UI’s source-consent promise with enforced per-source authorization and protect the plain-HTTP token channel. Add a generated Android prebuild/build test before relying on custom manifest/module injection or foreground-service behavior. Calendar read and local reminder logic have useful static guards and unit tests, but no device-level notification, permission-prompt, speech-recognition, or background-service behavior was verified.
