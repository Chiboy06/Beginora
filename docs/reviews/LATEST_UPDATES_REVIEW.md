# Beginora release-readiness review — 2026-10-12

**Candidate:** v0.2.3 / Android `versionCode` 5 (`app.beginora.android`). This review covers the latest fetched `origin/main` UI/startup changes, the previously integrated Android-first features, and the current local reliability fixes. See the [comprehensive functional audit](COMPREHENSIVE_FUNCTIONAL_AUDIT_2026-10-12.md) for the original findings and evidence boundaries.

## Implemented and rechecked

- **Startup/splash:** chat/model restoration no longer blocks the app shell; native splash hide is retried up to three times with bounded delay, safe failure logging, and a regression-tested controller. Android splash and launcher art use the generated Beginora sprout asset.
- **Home and onboarding:** latest main's redesigned home screen was merged with the bounded-startup/model-loading behavior; onboarding completion is reactive and persisted.
- **Models:** chat activation is restricted to ready primary models; embedding models remain separate. Repository downloads and local imports use distinct sanitized per-model paths, with shared legacy-file deletion guarded by remaining registry references.
- **Tasks/activity:** task-plus-plan creation and status-plus-outcome recording use SQLite transactions; the task store updates visible state after persistence succeeds. Task screens now offer explicit reminder cancellation and explain that snoozing does not cancel a separately chosen reminder.
- **Appointments:** changed-time reminders are identified as stale; cancellation/replacement preserves saved state when OS cancellation fails and the calendar UI offers explicit cancel/replace actions.
- **Auth safety:** the dormant client accepts only HTTPS (except loopback development), validates complete auth responses, and avoids leaving partial SecureStore sessions.
- **Integrated Android features:** voice transcript enters an editable draft and is never auto-sent; Telegram credentials use SecureStore; local reminders route to tasks; lock-screen model notifications use generic text; background-model retention is opt-in; plaintext LAN MCP remains disabled.
- **Updates/sync boundaries:** Expo OTA remains explicitly disabled unless a real EAS project is configured and opted in. Cloud task sync remains off and incomplete; no task data is uploaded by this candidate.
- **CI/docs:** CI covers clean Android prebuild and JS export in addition to standard checks. Architecture, privacy, update and cloud-sync notes distinguish current behavior from planned work.

## Validation

| Check | Result |
|---|---|
| Clean install (`npm ci --legacy-peer-deps`) | Pass; postinstall compatibility patches reapplied |
| TypeScript | Pass |
| Jest | Pass — 48 suites, 299 tests |
| Expo lint | Pass |
| Expo Doctor | Pass — 20/20 checks |
| Expo SDK dependency check | Pass |
| Security policy (`npm run audit:ci`) | Pass — 57 advisory instances (30 moderate, 27 high, 0 critical); two known upstream advisory IDs remain explicitly allowlisted because no patched published version was available at last registry check. This is not a vulnerability-free dependency graph. |
| Clean Expo Android prebuild | Pass |
| Production Android JS export | Pass — 8.1 MB Hermes bundle; native voice Activity and SystemActions package registration present |
| Resolved configuration | Pass — version 0.2.3 / code 5; EAS update URL absent and updates disabled; API URL unset and cloud sync disabled |
| Android release APK | Pass — package `app.beginora.android`, version 0.2.3/code 5; ZIP integrity and alignment verified; embedded JS bundle present; 187,516,052 bytes. SHA-256: `8cce90315c1b44660187e3f28f933e52b716ba260d0abeb201841bf706fdc7bf`. Debug signer SHA-256 matches v0.2.2, supporting an in-place upgrade. |
| GitHub PR #3 CI | Pass — clean install, Android prebuild/export, typecheck, lint, security gate and tests all green. |

## Remaining external/device work

1. **Real-device launch test:** no Android device is attached to the sandbox. The reviewed Skills.sh emulator helper is installed locally, but this sandbox has no `/dev/kvm`; the software-only AVD never completed Android package-manager boot, so the APK could not be installed there. This is not evidence of an APK launch failure. Install the verified v0.2.3 APK on the owner’s phone and follow [`ANDROID_SMOKE_TEST.md`](../ANDROID_SMOKE_TEST.md); if the sprout/splash still persists, capture cold-start `AndroidRuntime`, `ReactNativeJS`, and Expo logs before clearing app data.
2. **Repository-published app updates:** the app can check/download a compatible EAS Update only in an APK linked to a real EAS project. Enable it only after setting GitHub repository variable `EAS_PROJECT_ID`, variable `EAS_UPDATES_ENABLED=true`, secret `EXPO_TOKEN`, and building a new linked APK. The current candidate is intentionally not OTA-linked; a JS update cannot replace native code or permissions. See [`OTA_UPDATES.md`](../OTA_UPDATES.md).
3. **Cloud task sync:** no working backend is available. `api.beginora.app` did not resolve from this environment, API/Cognito values are not configured, and local task changes are not yet enqueued/reconciled end-to-end. Sync remains disabled; the app keeps core tasks local. Do not upload personal task data until the owner supplies a live authenticated HTTPS API and Cognito pool/client (or explicitly chooses and provisions an alternative backend), plus consent, deletion, retries, and conflict behavior. See [`CLOUD_SYNC_STATUS.md`](../CLOUD_SYNC_STATUS.md).
4. **Human release review:** store signing and Play/App Store distribution are not configured. The local APK uses the sandbox debug signing identity. Verify it installs over the prior same-key test build before relying on upgrade behavior.

## Current privacy boundaries

- Task plans, activity and model files stay in local app-private storage; cloud sync is off.
- Calendar permissions are requested only after user action; saving through the device calendar may sync with the user’s calendar provider.
- Email opens the device composer; Beginora does not silently send mail.
- Voice recognition is Android/provider-dependent and may use a network, but transcripts remain editable and are not auto-submitted.
- Telegram sends only after a user-triggered action; the selected content goes to Telegram.
- EAS checks are unavailable until a linked, explicitly enabled build is installed.
- MCP remains unavailable until transport and source-level authorization are implemented and verified.
