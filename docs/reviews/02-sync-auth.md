# Beginora: Authentication, Cloud Sync, and Update Delivery Audit

**Review type:** Static repository review only
**Checkout:** `/home/ubuntu/Beginora-latest` — `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`origin/main`, local branch `fix/integrate-latest-updates`)
**Review boundary:** Authentication, cloud sync, and OTA/native update-delivery boundaries. Directly related UI, persistence, tests, build configuration, and workflows were inspected.
**Not done:** No application source changes, migrations, commits, pushes, builds, tests, or device/runtime validation. No `.env` file was read. Findings distinguish checked-in evidence from runtime assumptions.

## Executive summary

**Overall: partial integration; cloud sync and authentication are dormant scaffolding, while a conditional, manual preview OTA path is connected in code.** The app settings button reaches the update service, and the update service has focused mocked unit tests. Whether OTA is active for any installed build depends on EAS project/environment configuration that is not verifiable from this checkout.

Authentication functions exist and use `expo-secure-store` for returned tokens, but no production UI or application service calls them. The sync path is not end-to-end: normal task writes go straight to SQLite, no caller enqueues sync work, the app root does not start the worker, and the worker's configuration gates differ from the Expo config flags. The checked-in project decision explicitly says sync is off because no backend exists. If the sync worker were enabled or invoked, its request omits authentication and sends JSON payloads without enforcing HTTPS. Those are blockers to enabling it with real user data.

This report does not audit voice/audio, connector, or notification execution paths. `app.json` does contain native permission declarations and usage descriptions, but declarations alone do not verify permission request flows or those integrations.

## Call-path trace: what is connected

### Authentication

- `lib/auth/auth-service.ts:24-42` reads the API base URL from `Constants.expoConfig.extra.apiUrl` and issues JSON POSTs. `signUp`/`signIn` call `/auth/signup` and `/auth/signin` (`:45-88`); `refreshAccessToken` calls `/auth/refresh` (`:98-110`); `signOut` makes a best-effort `/auth/signout` call (`:90-96`).
- Access/refresh tokens and a serialized user are placed in SecureStore on a successful HTTP response (`:58-62`, `:80-84`). The app manifest includes the `expo-secure-store` plugin (`app.json:42-48`) and the package is a dependency (`package.json:32-35`). This supports the intended secure-storage integration at source level; it does not establish native runtime behavior.
- Repository-wide production-source search found no import/call site for `auth-service.ts`. The visible settings route contains no account/sign-in controls (`app/settings.tsx:47-64`, `:234-281`), and there is no auth test file. Thus there is no verified UI → auth service → authenticated API → UI state call path.
- The app config exposes Cognito pool/client/region values (`app.config.ts:25-29`), but the service instead calls custom REST endpoints and does not read those Cognito values. Backend endpoints/provider behavior are not present or verified here.

### Cloud sync

- Task writes reach local SQLite through `useTaskStore.addTask → saveTask` (`lib/store/task-store.ts:45-71`; `lib/storage/database.ts:844-855`). The task store's other mutations likewise call only database helpers (`task-store.ts:73-151`). No task-store mutation enqueues an upsert/delete.
- `lib/sync/sync-queue.ts:22-36` contains a queue producer; static call-site search found no production caller. The only other references to `sync_queue` are schema and sync-service processing.
- The runner (`lib/sync/sync-service.ts:63-91`) checks `prefs.cloudSyncEnabled`, then `process.env.API_URL`, and provides a `setInterval` starter. No app-root or screen call to `startSyncService`/`runSyncCycle` exists. Root initialization loads chat and tasks only (`app/_layout.tsx:25-33`). The timer is not evidence of OS-scheduled/background execution, and the worker is not wired into this app path.
- There are three distinct notions of the sync flag: `app.config.ts:29` puts `enableCloudSync` in Expo `extra`; `lib/store/prefs.ts:22-26` uses an MMKV key that defaults to false; and SQLite `config` is seeded with `cloud_sync_enabled=false` (`lib/storage/database.ts:241-262`). The runner reads only the MMKV preference. Settings says cloud sync is not enabled (`app/settings.tsx:234-252`). EAS build profiles explicitly set `ENABLE_CLOUD_SYNC=false` (`eas.json:11-14`, `:17-22`, `:24-40`), consistent with the documented decision that no backend exists (`docs/DECISIONS.md:68-76`).
- The sync worker posts queue items as JSON to `/sync` (`lib/sync/sync-service.ts:49-61`). It does not attach an auth token, even though a separate token service exists. It reads `process.env.API_URL` (`:63-68`), whereas the config places `API_URL` into Expo `extra.apiUrl` (`app.config.ts:24-29`) and authentication reads that extra (`lib/auth/auth-service.ts:24-26`). No shared runtime API-config accessor is present.

### Update delivery

- The settings screen's “Check for updates” action invokes `checkForAppUpdate`, displays the returned message, and clears its busy state (`app/settings.tsx:175-182`, `:267-280`). The service gates development and disabled builds, checks, fetches only an available update, reloads only if `isNew`, and catches update errors (`lib/updates/update-service.ts:10-43`).
- OTA is conditional on `EAS_PROJECT_ID`: `app.config.ts:4-15` enables updates and supplies the update URL/channel request header only when set; otherwise it sets `enabled: false`. It uses `runtimeVersion.policy: appVersion` when linked (`:17-22`); the app version is `0.1.0` (`app.json:3-6`). Automatic checks are explicitly disabled (`app.config.ts:12-14`), so the verified product path is manual, from settings.
- `expo-updates` is both a dependency and an app plugin (`package.json:38`; `app.json:42-48`). `lib/updates/__tests__/update-service.test.ts:13-44` covers no-update, download/reload, disabled, and check-error responses using mocks. This is unit-test evidence, not an EAS publish or installed-build test.
- The GitHub publisher is opt-in via repository variable `EAS_UPDATES_ENABLED` (`.github/workflows/eas-update.yml:12-19`), validates `EXPO_TOKEN`/`EAS_PROJECT_ID` (`:29-34`), and publishes only to `preview` (`:39-40`). Preview/staging builds target `preview`, while production targets `production` (`eas.json:7-15`, `:24-40`). Repository secret/variable values and the currently installed channel cannot be determined from the checkout.

## Findings

### 1. Cloud sync is not wired from local task changes to a running worker — **Medium**

**Evidence:** Task mutations call database functions only (`lib/store/task-store.ts:45-71`, `:73-151`; `lib/storage/database.ts:844-855`, `:887-936`, `:986-992`). `enqueue` is defined in `lib/sync/sync-queue.ts:22-36` but has no production call site. `startSyncService` is defined at `lib/sync/sync-service.ts:80-91` but has no app call site; `app/_layout.tsx:25-33` only initializes chat/tasks. Settings explicitly describes the build as local-only (`app/settings.tsx:251`).

**Impact:** In the reviewed app path, task creates/edits/deletes remain local and cannot reach a cloud account. This is consistent with the current prototype decision, so it is not evidence of current cloud data loss; it does mean “sync implemented” should not be read as an available user feature.

**Suggested fix:** Keep the feature clearly labeled unavailable until a backend and consent flow exist. When enabled, connect every relevant local create/update/delete to the queue and start/stop the worker through a lifecycle owner; test the complete local-write → queue → request → acknowledgement path.

**Confidence:** High.

### 2. Sync's flags and API URL have conflicting sources of truth — **Medium**

**Evidence:** Expo config maps environment values to `extra.enableCloudSync` and `extra.apiUrl` (`app.config.ts:24-29`); the runner instead gates on MMKV `prefs.cloudSyncEnabled` and reads `process.env.API_URL` (`lib/sync/sync-service.ts:63-68`; `lib/store/prefs.ts:22-26`). SQLite also seeds a separate `cloud_sync_enabled` config row (`lib/storage/database.ts:241-262`). `auth-service.ts` uses `Constants.expoConfig.extra.apiUrl` (`:24-26`), demonstrating a different API URL path. No UI setting or production call site sets the MMKV sync key.

**Impact:** Setting `ENABLE_CLOUD_SYNC=true` in build configuration is not sufficient to make this runner run; `extra.enableCloudSync` is not consumed by it. Conversely, its runtime gate is not explicitly tied to the EAS build flag. An `extra.apiUrl` value by itself is not consumed by the runner. Actual environment inlining in a particular build was not tested.

**Suggested fix:** Use one typed runtime config accessor (for example, reading the Expo config extra), and one explicit feature/consent gate shared by UI and worker. Remove or migrate the redundant SQLite/MMKV/config representations. Add tests proving false/true behavior under production-like config.

**Confidence:** High for the source mismatch; runtime outcome depends on build environment.

### 3. If invoked, sync sends payloads without user authentication or an HTTPS requirement — **High (conditional on enabling sync)**

**Evidence:** `processItem` POSTs `entity`, `entityId`, operation, and parsed payload with only `Content-Type` (`lib/sync/sync-service.ts:49-61`); `runSyncCycle` uses no `getAccessToken`/refresh call (`:63-77`). The queued payload is serialized JSON in SQLite (`lib/sync/sync-queue.ts:22-35`; schema in `lib/storage/database.ts:246-257`). API URL is accepted without a transport-scheme check (`sync-service.ts:66-68`). The architecture document describes encryption before POST (`docs/ARCHITECTURE.md:278-290`), but the checked-in worker does not do that.

**Impact:** If user task/message data is ever queued and this path is activated, the server request has no account credential or explicit per-user authorization context. A non-HTTPS configured URL would not be rejected by this code. Task titles and message payloads may be sensitive personal information. Current checked-in settings/build defaults leave sync off, and there are no queue producers, so this is a latent enablement blocker, not evidence that data is currently being transmitted.

**Suggested fix:** Do not enable cloud sync until the backend contract is implemented and reviewed. Add authenticated requests tied to the signed-in user, enforce HTTPS in release builds, document server-side retention/transport protections, and add a user-visible consent/disable/delete flow. If payload encryption is a requirement, implement and test it rather than relying on the architecture diagram.

**Confidence:** High.

### 4. Authentication code has no user-facing integration and does not validate a complete session response — **Medium**

**Evidence:** The service exports sign-up/sign-in/sign-out/session helpers (`lib/auth/auth-service.ts:45-129`), but repository-wide production-source search found no caller; the settings screen has no account controls (`app/settings.tsx:234-281`). Successful sign-up/sign-in responses are treated as success without checking that access token, refresh token, and user exist; missing token fields are written as empty strings (`auth-service.ts:51-62`, `:73-84`). `isSignedIn` only checks for a stored access token (`:126-129`), while refresh is a separate function with no caller (`:98-110`). The config has Cognito values (`app.config.ts:25-28`), but this code calls custom REST routes (`auth-service.ts:45-51`, `:68-74`, `:98-103`) and does not use those values.

**Impact:** An end user has no sign-in/sign-out route in the visible app, so the service does not establish an application session or authorize sync. A malformed 2xx response can yield `{ok: true}` despite no usable session. The existence/behavior of the custom endpoints and any Cognito setup cannot be inferred from this repository.

**Suggested fix:** Decide whether auth is a custom API or Cognito; remove dead config or integrate the selected provider. Add UI/state ownership, validate required response fields before persisting, define token expiry/refresh/revocation behavior, and test network/partial-response/SecureStore failures.

**Confidence:** High for absent call sites and response-validation gap; low for external backend availability.

### 5. Sync items that exhaust retries become permanently invisible to the worker — **Medium (conditional on queue use)**

**Evidence:** Both queue readers filter to `attempts < 5` (`lib/sync/sync-queue.ts:38-46`; `lib/sync/sync-service.ts:23-29`), while failure handling increments attempts (`sync-queue.ts:60-67`; `sync-service.ts:37-47`). At five failures the row remains stored but is no longer selected. No dead-letter state, user-visible error, or retry action is present; `clearQueue` is the only explicit whole-queue cleanup helper (`sync-queue.ts:69-72`).

**Impact:** Once sync is integrated, an item that repeatedly fails can remain stranded locally without surfacing that the remote copy is stale. This does not delete the local task, but it can silently defeat cloud backup/synchronization expectations.

**Suggested fix:** Mark exhausted items as dead-lettered and expose retry/error status in diagnostics or settings; define idempotency/conflict semantics and tests for backoff, exhaustion, recovery, and deletion propagation.

**Confidence:** High.

### 6. Parallel persistence/queue implementations invite drift — **Low**

**Evidence:** `lib/store/prefs.ts:1-5`, `:22-26` stores the sync preference in MMKV, while `lib/storage/database.ts:241-262` seeds a similarly named SQLite config key. Separately, `lib/db/client.ts:8-30` opens `beginora.db` and seeds config but does not call `runMigrations`; `lib/storage/database.ts:187-273` is the path that creates baseline tables and runs migrations. Static production-source search found no caller of `getDb` in `lib/db/client.ts`. Queue selection and retry operations are also reimplemented inside `sync-service.ts:23-47` despite helpers in `sync-queue.ts:38-67`.

**Impact:** The current active task path uses `lib/storage/database.ts`, so this is not proof of present schema corruption. A future caller using the alternative client or one queue implementation may bypass migrations or diverge in retry/order behavior, while similarly named flags may appear synchronized when they are not.

**Suggested fix:** Consolidate on one database bootstrap/migration path and one queue implementation; remove the unused client or route all access through it. Give UI preferences and persisted database config distinct names if both are genuinely required.

**Confidence:** Medium.

### 7. OTA publishing is preview-only; production delivery is not configured in this workflow — **Low / confirm intent**

**Evidence:** The workflow is named “Publish EAS Preview Update,” always sets/publishes `preview` (`.github/workflows/eas-update.yml:1`, `:18-19`, `:39-40`). The production build profile uses channel `production` (`eas.json:33-40`), and no production publishing step appears in this workflow. The settings label also describes a preview-channel check (`app/settings.tsx:267-280`).

**Impact:** A production-channel build will not receive updates published by this workflow. This appears intentionally preview-only, not necessarily a defect, but there is no checked-in production promotion/release path to validate.

**Suggested fix:** If production OTA is intended, add a separately protected promotion/publish job with production approvals and an explicit matching runtime/channel. Otherwise document that production updates require a new native release and keep the UI/channel wording precise for each build.

**Confidence:** High for the channel mismatch; whether it is a gap depends on release intent.

## Verified working from checked-in code/tests

- Auth token persistence is routed through `expo-secure-store`; the native plugin/dependency are declared (`app.json:42-48`; `package.json:32-35`). No device-level storage test was performed.
- The update service is reachable from a settings action (`app/settings.tsx:175-182`, `:267-280`) and has mocked tests for no-update, available update/reload, disabled service, and failed check (`lib/updates/__tests__/update-service.test.ts:20-43`).
- OTA is intentionally disabled when no EAS project ID is supplied and is manually checked rather than checked automatically (`app.config.ts:4-15`, `:12-14`). UI/service code reports disabled/unavailable rather than preventing offline use (`lib/updates/update-service.ts:17-22`).
- The project decision explicitly keeps cloud sync disabled until a backend exists (`docs/DECISIONS.md:68-76`); all checked-in EAS build profiles set it false (`eas.json:11-14`, `:17-22`, `:24-40`).
- `expo-updates` is included in package dependencies and app plugins, and the update workflow is opt-in and validates required publishing credentials before attempting its preview publish (`package.json:38`; `app.json:42-48`; `.github/workflows/eas-update.yml:12-34`). Repository-side secrets and whether the workflow has run successfully are unknown.

## Test and verification gaps

- No auth or sync test files are present; the only direct service test in these directories is `lib/updates/__tests__/update-service.test.ts`. In particular, there is no test for UI-to-auth wiring, SecureStore partial failures, queue enqueue/dequeue, request authentication, API configuration, retries/exhaustion, or sync worker lifecycle.
- Update tests mock `expo-updates`; there is no evidence here of an EAS-linked build, actual channel/project ID, release binary, OTA download, restart, runtime-version compatibility, or rollback test. Update-test branches such as development mode, `fetchUpdateAsync` returning `isNew: false`, and reload failure are not explicitly tested in the inspected test file.
- Migration tests (`lib/storage/__tests__/migrations.test.ts`) use a fake Expo SQLite surface and assert migration order/transaction boundaries; they do not validate the real on-device schema, sync queue behavior, or the alternative Drizzle client.
- CI is configured to run typecheck/lint/security audit/tests (`.github/workflows/ci.yml:25-39`), but CI was not run as part of this static review. The EAS update workflow does not itself include those quality steps before publishing (`.github/workflows/eas-update.yml:21-40`); a separate CI workflow exists, but ordering/branch protection requirements cannot be established from these files alone.
- GitHub repository variables/secrets, EAS project settings, API endpoint availability, auth backend semantics, and device/network behavior are not observable from the checkout. No conclusion is made that any external service is available or that OTA/sync works at runtime.
- Voice/audio, connector and notification permission request/use paths were not traced under this bounded audit. `app.json:17-39` contains Android permission declarations and iOS usage descriptions; that is not runtime evidence that permissions are requested or those features work.
