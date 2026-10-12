# Comprehensive Functional Audit — 2026-10-12

**Repository snapshot:** `HEAD 2f4fec4` on `fix/eas-ota-explicit-opt-in`; it contains `origin/main` at `3b1a1fd` as its base and is reported five commits ahead. **App version:** 0.2.2. **Method:** synthesis of six independent, read-only audit results supplied for this report. No source changes, new code research, builds, external-service checks, or device tests were performed for this synthesis.

## Executive assessment

The audits found **no demonstrated data loss on the ordinary startup path**, and several feared startup blockers are specifically mitigated in source: startup work is bounded after React mounts, model restoration is fire-and-forget, and ordinary promise failures are caught. Nevertheless, launch readiness on a real Android release is **not established**. Native splash dismissal depends on a React layout callback, its failure path is one-shot and silent, and a failure before `RootLayout` mounts is outside the JS timeout. No supplied result provides a completed 0.2.2 cold-launch trace.

The most consequential confirmed data-integrity defect is **model-file basename collision**: separate repositories can map to the same destination, overwrite one another, and share a deletion path. Task creation and task transitions also have non-atomic multi-write failure paths that can leave persisted state inconsistent. These are confirmed from the reviewed code paths, though the audit did not observe an actual storage failure in use.

For release confidence, the repository does not demonstrate a clean Android prebuild/release artifact, signer continuity, or production OTA channel configuration. Some resulting behavior depends on external EAS configuration that was not accessible, so these are release-validation gaps rather than proof that a particular EAS artifact is misconfigured.

**Severity register (unique consolidated items):** 0 Critical, 1 High-impact launch risk, 15 Medium findings. Low-severity usability, privacy, lifecycle, documentation, and policy findings are listed separately. “High-impact launch risk” denotes potential impact, not a confirmed reproduction of the reported device symptom.

## Scope and evidence boundaries

Covered areas: Android cold launch and onboarding/model restoration; Today/chat/task/focus flows; local model discovery, download, activation, and embedding; Android-native integrations and notifications; sync/auth/OTA/MCP and privacy/security claims; Android build and CI readiness.

The findings below preserve the distinction between:

- **Confirmed in source:** the described branch, missing call path, state ordering, or config is present in the reviewed snapshot. The corresponding failure may still require fault injection to reproduce.
- **Conditional/latent:** the code makes a failure possible, but it depends on runtime conditions or a feature currently disabled/dormant.
- **Unknown/device-only:** the supplied audits lack the artifact, device, external configuration, or runtime evidence needed to decide.

Generated `android/` files mentioned below are ignored local state; they are not evidence that a release artifact was generated from that exact snapshot. External EAS variables/credentials and server-side configuration were not inspected. No source was edited by the underlying audits.

## Ordered repair and validation plan

| Order | Priority | Why it comes first | Concrete action / release gate |
|---|---|---|---|
| 1 | **P0 — launch** | A real release may fail before the app shell is visible; static JS tests cannot resolve the device report. | Install the exact 0.2.2 release candidate on a clean Android device/emulator; timestamp logcat (`AndroidRuntime`, `ReactNativeJS`, Expo startup) from process start through Today. Verify bundle/native-module loading and splash dismissal. Do not attribute the symptom to model restore without evidence. |
| 2 | **P0 — launch robustness** | A rejected `hideAsync()` is swallowed after permanently setting the guard; a transient loading view is the only layout trigger. | Make splash hide retryable until success, log rejection, and invoke from a root/layout path that survives readiness branch changes. Add mocked RootLayout tests for quick readiness, timeout, rejection, and onLayout ordering; then device-test. A RootLayout fix cannot recover a JS bundle failure before React mounts; document/implement native-level recovery if required. |
| 3 | **P1 — build/release confidence** | CI currently does not prove that clean native generation, production bundling, signing, or release packaging works. | Add a clean-checkout pipeline: canonical `npm ci --legacy-peer-deps`, resolved Expo config validation, `expo prebuild --clean --platform android`, production JS export and Android AAB build. Assert package/version/versionCode, plugin/manifest/splash config and signing certificate. Pin CLI/tool versions. |
| 4 | **P1 — data integrity** | Model collisions can overwrite bytes or delete another model’s file; task failures can leave committed partial state. | Assign collision-resistant per-model file destinations and guard deletion by reference count/path ownership. Make task-plus-plan and status-plus-outcome writes transactional; add failure-injection tests and UI wording for partial/failed stages. |
| 5 | **P1 — model usability/recovery** | Embedder-first install can select an embedding-only model for chat; interrupted multi-GB downloads and failed activation are difficult to recover. | Restrict primary activation to chat/primary models; wire persisted resume/retry into store and UI; reconcile stale rows on startup; expose active-but-unloaded errors and retry/repair. |
| 6 | **P1 — reminders** | Existing notifications can outlive snoozed, moved, or deleted items; assistant reminders cannot be routed or cancelled reliably. | Define snooze semantics; add cancel/reschedule and stale-record reconciliation; persist assistant reminder IDs and routing metadata; surface cancellation failures. Test notification lifecycle end to end. |
| 7 | **P1 — security/claims** | Architecture text describes protections not configured by the active opener; dormant auth/MCP code must not be treated as active security. | Either implement/test SQLCipher and key lifecycle or clearly mark it as planned. Keep sync/MCP unavailable until their backend, auth, authorization, consent, and transport contracts are real and tested. Validate auth URLs/tokens before any activation. |
| 8 | **P2 — product/config/documentation** | Several advertised or expected capabilities are absent, disabled, or conditional. | Decide release OTA/signing strategy, align build and publish channels, correct export/delete/privacy copy, document sync as unavailable, and label historical architecture/review documents as superseded or planned. |
| 9 | **P2 — focused regression coverage** | Current tests mostly cover helpers/store utilities and mocks, not the UI/native lifecycle or storage fault paths. | Add the focused tests in the verification checklist below; keep device, release artifact, permission, and low-memory checks as explicit manual/release gates until automated device coverage exists. |

## Consolidated findings

### Launch, splash, onboarding, and build

#### H1. Android native splash may remain visible if JavaScript bootstrap fails before the root mounts — **High-impact risk; actual incident cause unknown**

**Evidence/status:** Android uses a native splash theme/artwork. `preventAutoHideAsync()` runs in JS and the JS hide call is reached only after React renders and a layout callback fires. The 1.5-second readiness guard begins only after RootLayout/effects run; it cannot rescue bundle loading, import-time native-module initialization, or a failure before RootLayout/layout. Model restoration itself is deliberately not awaited and should not hold the JS shell after init begins. A continuously visible sprout is therefore consistent with a pre-mount failure, but does not establish it.

**Locations:** `android/app/src/main/AndroidManifest.xml:32`; `android/app/src/main/java/app/beginora/android/MainActivity.kt:14-23`; `android/app/src/main/res/values/styles.xml:8-13`; `app.json:49-55`; `index.ts:1-2`; `app/_layout.tsx:15-31,41-45,47-62,169-183`; `lib/startup/startup-readiness.ts:1-29`; `lib/store/chat-store.ts:151-180`.

**Repair/verification:** First collect a cold-start trace and confirm the exact artifact/bundle. Add a release cold-start test and a documented crash-log procedure. If pre-React recovery is a product requirement, provide a native-level watchdog/error route; do not present the JS readiness timeout as protection against a bootstrap failure. Prior startup docs report no completed current-version device launch (`docs/ANDROID_STARTUP_FIX.md:24-28`).

#### M1. Native splash hide can fail permanently or miss the transient loading layout — **Medium; confirmed code risk**

**Evidence/status:** `hideNativeSplash` sets `splashHidden.current = true` before awaiting `SplashScreen.hideAsync()` and suppresses rejection. Subsequent calls then return without retry. Its only attachment is `onLayout` of the temporary `!ready` view, so quick branch transition before that callback is another conditional missed-handoff path. No evidence establishes either event on a particular device.

**Locations:** `app/_layout.tsx:40-45,54-60,169-183`.

**Repair:** Latch only after successful hide, log failure and retry with a bounded policy, and keep a suitable root layout target through readiness transitions. Test rejected hide and immediate readiness with mocked SplashScreen.

#### M2. Clean Android release generation/build/signing is not a CI gate — **Medium; confirmed pipeline gap**

**Evidence/status:** Tracked CI runs dependency install, typecheck, lint, audit, and Jest, but not Expo prebuild, production bundle export, Gradle release/AAB build, merged-manifest checks, or signer checks. The Android tree is gitignored. The inspected local Gradle release configuration uses `signingConfigs.debug`, but this is ignored local generated state, not proof of EAS signing behavior. The custom `with-android-signing` plugin is not in the checked `app.json` plugin list; an EAS-managed signing route could still exist but was not verified. No release workflow was found in tracked workflows.

**Locations:** `.github/workflows/ci.yml:25-39`; `.gitignore:45-48`; `app.json:40-71`; `app.config.ts:18-35`; `plugins/with-android-signing.js:3-12,33-64`; `eas.json:33-48`; local ignored `android/app/build.gradle:100-119`.

**Repair:** Select and document custom versus EAS-managed signing. Add clean native build and artifact certificate/version/upgrade checks. Pin CLI versions; current `eas.json` permits `>=12.0.0` and the update workflow uses `eas-cli@latest`.

#### M3. Production OTA is disabled by default and the tracked publisher targets preview — **Medium; external configuration unknown**

**Evidence/status:** Dynamic config enables Updates only with `EAS_UPDATES_ENABLED=true` and `EAS_PROJECT_ID`, neither supplied by the production profile. The checked Android manifest has Updates disabled. The tracked update workflow, if configured, publishes to `preview`, whereas production profile selects `production`. External EAS variables/build output were not inspected. This affects delivery of updates, not ordinary app startup.

**Locations:** `android/app/src/main/AndroidManifest.xml:24-28`; `app.config.ts:4-16,21-23`; `eas.json:6-40`; `.github/workflows/eas-update.yml:12-21,37-42`; `docs/OTA_UPDATES.md:17-23`.

**Repair:** Make OTA intent explicit per profile, supply/validate project and enablement for production if intended, align runtime/channel and publisher, and test resolved config plus update download/restart. Otherwise retain disabled defaults and state that OTA is not available.

#### M4. Architecture/security documentation overstates the active database encryption setup — **Medium; confirmed documentation/runtime mismatch**

**Evidence/status:** Architecture material describes SQLCipher, SecureStore-derived keying and biometric protection. The active database opener calls `SQLite.openDatabaseAsync('beginora.db')` without encryption key or SQLCipher options. This does not prove any data disclosure or compromise, but local-only storage is not equivalent to the documented application-layer encryption.

**Locations:** `docs/ARCHITECTURE.md:59,167-171,229-240`; `lib/storage/database.ts:187-194`.

**Repair:** Implement and device-test encryption/key lifecycle if it is a requirement, or explicitly mark these mitigations planned and correct security/product copy. Include backup/restore and key-loss behavior in the design.

### Local data integrity and task/focus workflow

#### M5. Create-task plan failure leaves an inserted task and retry can duplicate it — **Medium; confirmed failure-path inconsistency**

**Evidence/status:** The screen persists a task before generating/persisting its plan. If plan persistence fails, in-memory rollback does not delete the SQLite task; the UI says the task was not saved and a retry inserts a new ID.

**Locations:** `app/task/new.tsx:30-44`; `lib/store/task-store.ts:46-89`; `lib/storage/database.ts:854-864,920-932`.

**Repair:** Make task-plus-plan atomic, or retain the new task ID and retry the plan write / delete the inserted row on failure. Distinguish task-save failure from plan-generation/persistence failure. Inject the plan-write failure and assert retry has no orphan or duplicate.

#### M6. Task status can persist when its outcome/activity write fails — **Medium; confirmed failure-path inconsistency**

**Evidence/status:** Done, snooze and start persist status before the separate outcome row. On second-write failure, persisted status remains changed while the handler reports failure; notably Start may leave a task active without opening focus.

**Locations:** `app/task/[id].tsx:77-89,91-103,122-134`; `lib/store/task-store.ts:98-129`; `lib/storage/database.ts:897-906,963-974`.

**Repair:** Put status and outcome in one SQLite transaction, update Zustand only after commit, and ensure navigation follows committed success. Otherwise compensate/refresh and report partial success truthfully. Add injected second-write-failure tests for all transitions.

#### M7. Fixed task filter row may overflow on compact screens or larger text — **Low; visual risk not device-verified**

**Locations:** `app/(tabs)/tasks.tsx:113-130,181-203`.

**Repair:** Use horizontal scrolling with end padding or wrapping; validate small widths and increased font scale.

#### M8. Focus countdown is component-local and resets after remount/restart — **Low; contract-dependent**

**Evidence/status:** Timer state/refs are initialized when FocusScreen mounts; deadline defaults to now plus five minutes, while task active status persists independently. Helper tests do not settle the expected resume contract.

**Locations:** `app/task/focus.tsx:17-26,41-58`.

**Repair:** If focus sessions must survive navigation/background/process death, persist deadline/remaining time by task and restore it. Otherwise define reopening as a fresh session and communicate it. Test pause/resume, lifecycle and process restart against that contract.

### Models, downloads, and embedding

#### M9. Embedding-only catalog entry may be auto-selected as the chat model — **Medium; confirmed role check missing**

**Evidence/status:** Successful download auto-calls `activate(id)` when no model is active, without checking role. The Nomic Embed catalog entry is role `embedding`, while activation accepts ready models and registry active lookup does not filter role. Installing it first can make chat unavailable or fail generation.

**Locations:** `lib/store/model-store.ts:196-217,424-431`; `lib/models/catalog.ts:72-84`.

**Repair:** Restrict chat activation and auto-selection to `primary` role. Keep embedding models available to the lazy embed engine and make the UI distinguish installation from chat selection. Test fresh embedder-first install.

#### M10. Interrupted/failed model downloads have no wired resume/retry after restart — **Medium; confirmed integration gap**

**Evidence/status:** Low-level downloader supports resume tokens, but the store does not pass a stored token back and exposes no resume/pause action. UI hides Download for an installed row and only offers Cancel during in-memory downloading; after process death the progress map is gone while a DB row may remain downloading/paused/error.

**Locations:** `lib/store/model-store.ts:335-350,375-379`; `app/models.tsx:197-198,222-247,266-299`; `lib/models/download-manager.ts:157-176`.

**Repair:** Reconcile stale rows at startup, persist/use resume token and partial file, expose Resume/Retry or clear restart action, and test store recreation/process death through UI.

#### M11. Same-basename GGUFs can overwrite/delete each other — **Medium; confirmed data-integrity risk**

**Evidence/status:** Destination is `baseName(file.path)` under shared models directory; downloader removes existing final path before moving the new file; registry rows can reference that same path and deleting either row deletes the file. Two repository files with the same basename can therefore silently replace bytes under both records.

**Locations:** `lib/store/model-store.ts:256-258,304-310`; `lib/models/download-manager.ts:18-23,207-209`.

**Repair:** Use a unique destination derived from stable model ID or repository/file hash plus basename; persist it; guard deletion against references. Apply collision handling to local imports too. Test two same-name repositories, file contents, and independent deletion.

#### M12. Failed native load can leave a misleading Active badge and no retry — **Medium; confirmed UI recovery gap**

**Evidence/status:** Startup catches native load exceptions/notifies but does not change persisted active selection. Activation failure records store error/actual loaded status but active row remains selected; Models UI gives no Use/Retry control for that row, despite notice advising user to open Models.

**Locations:** `lib/store/chat-store.ts:119-132`; `lib/store/model-store.ts:224-230`; `app/models.tsx:233-247,286-299`.

**Repair:** Separate desired model from successfully loaded state; show row-level load error and retry/repair/re-download control. Test OOM/missing file and successful retry.

#### M13. Available Hugging Face SHA-256 is not verified — **Low; confirmed integrity gap**

**Evidence/status:** LFS SHA-256 is parsed/stored, but completion checks lower-bound size and GGUF metadata; it does not compare actual content hash. This is not evidence any downloaded current model is corrupt.

**Locations:** `lib/models/hf-client.ts:41-48`; `lib/store/model-store.ts:311-317,403-415`; `lib/models/download-manager.ts:179-197`.

**Repair:** Verify supplied SHA-256 before finalization using streaming hash where feasible; preserve GGUF header validation separately. Test same-size mismatch.

#### M14. Embedding unload can race load or active embedding — **Low; native lifecycle behavior unknown**

**Evidence/status:** Embedding calls use `embedLock`; `unloadEmbeddingModel()` releases context without that lock and does not coordinate with `loadPromise`. Root triggers unload on background and Android memory warning. Actual llama.rn race effects are unverified.

**Locations:** `lib/llm/embed-engine.ts:18-27,55-80,86-97`; `app/_layout.tsx:73-93`.

**Repair:** Serialize init/embed/release through one lifecycle lock; await, cancel, or invalidate pending work before release. Add deferred-promise race tests and low-memory/background device validation.

### Notifications, permissions, and native integrations

#### M15. Snoozing a task leaves its existing reminder scheduled — **Medium; confirmed behavior**

**Evidence/status:** Snooze changes status without changing reminder. Status logic cancels only on Done; existing notification retains original reminder ID/time and the screen does not expose cancel while a reminder exists.

**Locations:** `app/task/[id].tsx:91-103,136-160,269-277`; `lib/store/task-store.ts:98-121`.

**Repair:** Define snooze semantics (cancel or reschedule), keep stored reminder ID consistent, expose cancellation where appropriate, and test snooze/done/delete/cancel failure.

#### M16. Appointment reminder records can outlive moved/deleted events and cannot be cancelled in UI — **Medium; confirmed reconciliation gap**

**Evidence/status:** Reminder keyed by event ID/start returns null when start changes but does not cancel old notification; deleted events have no reconciliation. Calendar UI can set/show reminder but not cancel. Replacement path can swallow old-cancel failure after a new reminder is set.

**Locations:** `lib/native/appointment-reminders.ts:27-29,48-57,59-100`; `app/calendar.tsx:49-52,113-135`.

**Repair:** Add cancel operation that cancels OS notification and removes config, expose in calendar UI, reconcile stored records with current event IDs/start times, and surface cancellation failures. Test moved/deleted/replacement-failure cases.

#### M17. Assistant-created reminders lose ID and notification taps do not route — **Medium; confirmed gap**

**Evidence/status:** Scheduler call omits notification data and returns no identifier to the assistant flow; response listener handles task/appointment kinds only and clears other responses. No durable cancellation/deduplication path exists for assistant reminders.

**Locations:** `lib/native/reminders.ts:87-96`; `app/_layout.tsx:100-110`; `lib/orchestrator/tool-dispatcher.ts:130-135`.

**Repair:** Choose ownership model; persist/return ID, attach routing metadata, handle tap route, and provide cancellation/management. Test cold and warm taps and repeated identical reminders.

#### L1. Assistant reminder body can expose user text on notification surfaces — **Low; device behavior unknown**

**Locations:** `lib/native/reminders.ts:60-67,87-96`; `app/_layout.tsx:13-19`.

**Repair:** Use generic text and keep sensitive details in-app, or provide a privacy setting and explain OS lock-screen controls. Verify supported Android versions and lock-screen settings.

#### L2. Permanently denied contacts/notification permission has no guided recovery — **Low; confirmed UX gap**

**Evidence/status:** Contacts/reminder flows request without checking `canAskAgain` (calendar permission flow does check). After permanent denial the user gets generic failure and no Settings guidance; manual/core fallbacks remain.

**Locations:** `lib/native/contacts.ts:11-14,33-41`; `lib/native/reminders.ts:30-35,55-59`; comparison: `app/calendar.ts:18-24`.

**Repair:** Check current status and `canAskAgain`; when prompting is no longer possible, explain OS Settings route and preserve manual fallback. Test initial/permanent denial on Android versions in scope.

**Validated native paths:** The supplied audit found no registration mismatch in its checked generated snapshot for `SystemActionsPackage`, voice/quick-chat Activities, widget receiver, foreground service, permissions, and JS route through chat. Settings' background model service opt-in appears internally consistent. These checks are not proof of clean prebuild output or device lifecycle behavior. Email drafting correctly hands off to the user's mail app and does not claim to have sent/saved the message.

### Cloud sync, auth, OTA, MCP, privacy claims

#### M18. Cloud sync is not wired end-to-end; task writes do not enqueue and no worker starts — **Medium capability gap; currently no cloud data loss demonstrated**

**Evidence/status:** Production task mutations call local DB only; no enqueue caller or `startSyncService()`/`runSyncCycle()` caller was found. Worker requires flags, HTTPS URL, opt-in and token; consent defaults false, EAS profiles set sync false, and docs say no backend/feature inactive. Users therefore do not currently receive cross-device sync. This is not evidence of lost cloud copies today. If partially activated later, deletions also need tombstones/remote propagation.

**Locations:** `lib/store/task-store.ts:46-170`; `lib/sync/sync-queue.ts:22-36`; `lib/sync/sync-service.ts:116-149`; `app/_layout.tsx:47-63`; `lib/store/prefs.ts:22-27`; `eas.json:11-40`; `docs/CLOUD_SYNC_STATUS.md:12-30`.

**Repair:** Keep capability clearly unavailable/off until backend, account and consent exist. Before enabling, enqueue every supported mutation, run/stop worker from app lifecycle, and specify delete tombstones, conflict resolution, idempotency and isolation. Preserve local source records on remote failure.

#### M19. Dormant sync retry queue silently strands exhausted rows — **Medium latent risk; sync currently inactive**

**Evidence/status:** Worker selects attempts `< 5`; after fifth non-auth failure row remains but is excluded without dead-letter state, user status or retry. Existing test covers one 503 only.

**Locations:** `lib/sync/sync-service.ts:25-27,48-55,62-71,125-135`; `lib/sync/__tests__/sync-service.test.ts:142-153`.

**Repair:** Add dead-letter state, surfaced pending/failed status and manual retry/retention. Test fifth failure. Do not describe this as present task data loss while sync has no producer/caller.

#### L3. Dormant auth client accepts HTTP URLs and incomplete success responses — **Low now / security-sensitive before activation**

**Evidence/status:** Custom REST client concatenates configured URL without HTTPS validation; sends password/refresh token JSON; accepts arbitrary 2xx and may store empty tokens. Cognito values in app extra are not used by this client. No active sign-in UI/backend call path was found, so no credential transmission was observed.

**Locations:** `lib/auth/auth-service.ts:24-42,45-84,98-114,126-129`; `app.config.ts:24-30`; `docs/CLOUD_SYNC_STATUS.md:14-20`.

**Repair:** Select a single identity contract; reject non-HTTPS before requests, validate required response fields, and define rotation/expiry/revocation/session state. Test malformed responses and secure-storage failures before wiring.

#### L4. Dormant MCP JSON-RPC handler does not validate bearer token before read tools — **Low now / must block reactivation**

**Evidence/status:** Current lifecycle fails closed: enabling throws, startup disables server and clears pairings. However, JSON-RPC receives but does not validate token before `initialize`/`tools/list`/`tools/call`; `touch(token)` occurs only after read tool. Thus current MCP is not active exposure, but re-enabling transport without authorization would be unsafe.

**Locations:** `lib/mcp/mcp-lifecycle.ts:14-35`; `app/_layout.tsx:47-53`; `app/mcp.tsx:10-18`; `lib/mcp/mcp-server.ts:24-65`; `lib/native/mcp-server.ts:37-49`.

**Repair:** Keep disabled until encrypted transport, token validity/revocation and source scopes are enforced at actual network/native boundary before any data. Test invalid/missing/revoked tokens and per-source permissions.

#### L5. Privacy copy understates automatic EAS update checks — **Low; conditional on linked/enabled build**

**Evidence/status:** Root checks on initial online state, foreground, and reconnection and silently downloads compatible update; general copy can imply provider contact only after user choice. No task data is shown to be sent by checks. Whether checks run depends on EAS config.

**Locations:** `app/_layout.tsx:120-161`; `app/settings.tsx:343,505-508`; `README.md:9,106`; `lib/connectors/registry.ts:87-98`; `docs/OTA_UPDATES.md:3-5`.

**Repair:** Describe automatic check triggers and version/runtime/channel metadata, or implement a real opt-in gate. Test copy against resolved profile behavior.

#### L6. README advertises export and delete-all settings that are absent — **Low; confirmed capability/documentation mismatch**

**Locations:** `README.md:38,109-111`; inspected Settings tail `app/settings.tsx:589-601`.

**Repair:** Implement/test full export and atomic erase of DB/files/model/config data or remove unsupported promise and describe per-record deletion accurately.

#### L7. Historic review snapshots contain stale security claims — **Low; documentation risk**

**Evidence/status:** Older review documents describe sync without bearer/HTTPS and Telegram token in SQLite, whereas current source uses HTTPS/Bearer/refresh and SecureStore; MCP currently refuses enable. Claims are commit-scoped/historical but not clearly marked superseded.

**Locations:** `docs/reviews/02-sync-auth.md:3-12,62-70`; `docs/reviews/05-telegram-mcp.md:4-11,90-96`; `docs/reviews/LATEST_UPDATES_REVIEW.md:3,47-59`.

**Repair:** Mark historical snapshot/commit at the top and maintain a current index to status docs and active code.

### CI, dependencies, and maintained documentation

#### L8. Postinstall modifies dependency sources using brittle text replacements — **Low; no current failure shown**

**Evidence/status:** Every install edits files inside `node_modules`; exact source snippets and locked versions are assumed. Script fails fast if snippets are absent. Clean `npm ci` was not run in the relevant audit, so compatibility after dependency changes is unknown.

**Locations:** `package.json:10`; `scripts/postinstall-patches.js:6-43,46-86`; `package-lock.json:4-5`.

**Repair:** Use reviewed versioned patch files or maintained forks; assert package versions/match counts and idempotency; run clean-install and resulting native/PDF-path checks in CI.

#### L9. Audit-policy exceptions have no enforced expiry and Moderate totals never fail — **Low; policy gap**

**Locations:** `scripts/check-audit-policy.js:6-12,41-50,73-81`; `.github/workflows/ci.yml:34-35`.

**Repair:** Add review/expiry metadata and fail overdue exceptions; define Moderate threshold/rationale; test the parser/policy on representative local JSON. No live `npm audit` was performed in the supplied audit.

#### L10. Architecture doc presents an obsolete stack/layout without clear current-vs-target boundary — **Low; documentation risk**

**Evidence/status:** Doc references Expo SDK 51+, Reanimated 3/Moti, NativeWind/Tamagui and `src/features`; package declares Expo 58, React Native 0.88.0-rc.4, Reanimated 4.7, with implementation in `app/` and `lib/`. It is described as an architecture plan, but implemented state vs future goal is unclear.

**Locations:** `docs/ARCHITECTURE.md:49-62,81-127,346-362`; `package.json:18-67`; `app.config.ts:18-23`.

**Repair:** Relabel as historical/target design or separate implemented architecture from planned work and link to current config/source of truth.

## Validated areas (source/tests, not release-device proof)

- Startup-readiness helper catches/settles resolve, rejection, and timeout cases. Model restore is detached from chat initialization and caught; tests verify stalled native load does not hold chat init and failure/no-model behavior.
- Onboarding preference is synchronously read; incomplete onboarding redirects to `/onboarding`; completion persists and replaces to `/(tabs)`; Today is the first tab. These are source/store checks, **not** navigation cold-start integration tests.
- No actionable unhandled promise was identified on ordinary startup call sites in the supplied review. Model restore alone should not keep the native splash indefinitely after JS has mounted.
- Local chat uses llama.rn; no external LLM inference provider was found. Hugging Face is used for model discovery/download. Task decomposition has deterministic fallback when no model, short task, or generation/output validation failure; this is not a general chat fallback.
- Chat composer is gated by `modelLoaded`; while no model is ready, entry/send/Android voice are disabled with a Models banner, while task/calendar/email actions remain available. This behavior lacks screen/accessibility/keyboard integration tests.
- Existing focused tests exercise startup readiness, chat-store persistence/startup, onboarding, focus helpers, migrations, calendar/appointment reminders, connector permission status, email composition, downloader resume-token helper, sync mocks, OTA mocks, and MCP lifecycle. Counts reported by independent audits are **not additive**: focused runs included 4 suites/14 tests, 4/16, and 5/22; one broader existing-check run reported 43 suites/276 tests plus typecheck and lint. Reported typecheck and lint passed in that broad run. None constitutes native release/device coverage.
- Android-native generated snapshot review found expected system-action registrations and integration paths, but generated output is ignored and was not rebuilt here. Permission prompts, notification delivery/cancellation, widget/voice Activity lifecycle and cold-start deep links remain unverified.
- Background model service opt-in appears internally consistent in source: preference defaults off, Settings requests notification permission before enabling, and RootLayout starts it only with loaded model plus preference. Actual Android policy/device behavior is unknown.

## Verification checklist — required or unresolved

### Android launch/release (cannot be confirmed in this sandbox)

1. Cold-install and launch the **exact 0.2.2 release APK/AAB-derived install** on supported Android; capture timestamped `AndroidRuntime`, `ReactNativeJS`, Expo/bundle logs through splash, first React root, onboarding redirect, Today and model restoration.
2. Repeat with no active model, an existing active model, slow/stalled local DB/model initialization, rejected DB initialization, and low memory. Confirm JS shell appears independently of model restore.
3. Reproduce `hideAsync` rejection and fast readiness/layout ordering in a RootLayout integration test; verify hide retries/logging and exactly-once successful completion.
4. Validate release JS bundle presence, native module registration, generated manifest/theme/splash assets and merged permissions from a clean prebuild. A pre-React/bootstrap fault needs separate diagnostic/recovery treatment.
5. Build/install signed candidate; inspect certificate fingerprint and test in-place upgrade from a prior production-signed version. External EAS credentials/build config were not examined.
6. Resolve production/preview EAS config with and without required environment variables; inspect project, runtime, channel, update enablement and publisher alignment; exercise actual download/restart only if OTA is intended.

### Storage and model workflow

1. Inject `updateTaskPlan` failure after task insertion and verify no orphan/duplicate on retry.
2. Inject outcome insertion failure after Done/Snooze/Start and verify transactionality, truthful messaging and correct focus navigation.
3. Install same-basename models from distinct repositories, validate unique bytes/paths, delete either, and ensure other model remains usable.
4. Exercise embedder-first activation, failed native model init/OOM and explicit retry; process-restart a paused/interrupted/failed download and validate resume/retry UI and cleanup.
5. Test SHA-256 match/mismatch including same-size corrupt payload; test embedding load/embed/unload races and Android background/memory-warning behavior.
6. If focus session resume is required, test pause/resume, route exit/reentry, app background/foreground and process restart.

### Notifications, permissions, and future integrations

1. Test task snooze/cancel/done/delete and reminder scheduling failures; appointment moved/deleted/cancelled and replacement cancellation failure; assistant notification ID, tap routing, deduplication and cancellation.
2. Test contacts, microphone and notifications first-denial/permanent-denial paths on Android 13+ and supported current versions; test notification privacy with screen locked and app foreground/background.
3. Keep sync/MCP unavailable until enabled end-to-end; then test consent-off no network, mutation enqueue/tombstone behavior, idempotency/conflict/account isolation, retry exhaustion/manual recovery, and invalid/revoked auth at the actual transport boundary.
4. Decide whether SQLCipher, export/erase, and focus-session persistence are launch requirements. Implement/device-test if required; otherwise correct claims and clearly state limits.

## Bottom line

Source and unit-test evidence supports a bounded post-mount startup and mostly coherent onboarding/model restoration. It does **not** prove the reported Android cold-launch issue, because the crucial native-to-JS transition and current release artifact were never validated on device. Fix the one-shot splash failure path and obtain a release logcat trace first. In parallel, close the direct model-file collision/data-integrity risk and transactional task-write gaps; then make model-download recovery and reminder lifecycle coherent. Treat cloud sync, OTA, auth and MCP according to their actual disabled/dormant state rather than implying capabilities that are not wired or validated.
