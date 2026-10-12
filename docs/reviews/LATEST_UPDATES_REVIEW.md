# Beginora release-readiness review — 2026-10-13

**Candidate:** v0.2.5 / Android `versionCode` 7 (`app.beginora.android`). This build follows the user's report that v0.2.4 still displayed “Getting your tasks ready…”. The provided screenshot shows the React readiness view, so the remaining visible state is app-level startup readiness (or repeated relaunch), not simply the native splash. The source comparison with original Vesta is in [VESTA_STARTUP_COMPARISON_2026-10-12.md](VESTA_STARTUP_COMPARISON_2026-10-12.md).

## Implemented

- **Startup readiness:** chat and task initialization now run on a deferred microtask, after the 1.5-second readiness timer is armed. Synchronous throws are caught; stalled promises do not gate the app shell. Legacy MCP shutdown remains attempted, but no longer sits inside the UI readiness `Promise.all`. Added tests for deferred invocation, synchronous errors, and hung startup work.
- **Splash lifecycle:** v0.2.4 removed the module-scope native splash hold. The screenshot shows that this alone did not resolve the user's visible loop.
- **OTA setup:** `app.config.ts` now accepts the project ID written by `eas update:configure` while retaining the explicit `EAS_UPDATES_ENABLED=true` gate. The EAS preview build uses the `preview` environment/channel and enables OTA only in that linked profile. The GitHub publisher specifies the required `preview` environment. The [OTA guide](../OTA_UPDATES.md) now gives click-by-click GitHub variable/secret setup, linked-build requirements, and test/publish steps.
- **Versioning:** candidate bumped to app version `0.2.5`, Android version code `7`; cloud sync remains default-off and no credentials or personal data were added.

## Validation

| Check | Result |
|---|---|
| Clean dependency install | Pass — `npm ci --legacy-peer-deps --no-audit --no-fund`; postinstall compatibility patches applied. No dependency versions changed. |
| TypeScript / lint | Pass |
| Jest | Pass — 48 suites, 302 tests |
| Expo package alignment / Doctor | Pass — dependencies aligned; Expo Doctor 20/20 |
| Security policy | Pass — 57 advisory instances (30 moderate, 27 high, 0 critical). Two known upstream advisory IDs remain explicitly allowlisted because no patched published version was available at last registry check. This is not a vulnerability-free dependency graph. |
| Clean Android prebuild / JS export | Pass — export bundled 1,488 modules |
| OTA config | Pass — remains disabled in the no-project default config; a separate dummy-ID check confirmed that explicit opt-in resolves an update URL and the `preview` channel. No EAS publication or project was created. |
| Android release APK | Pass — package `app.beginora.android`, version `0.2.5`, code `7`, 187,516,868 bytes. ZIP integrity, `zipalign`, embedded `assets/index.android.bundle`, and signature verified. Signer SHA-256 matches v0.2.4: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. APK SHA-256: `ab06e7872b44020fbfe88dc3cb45224bee1fb663e9448b4f41d97234ea954f43`. |
| GitHub PR checks | Pending for the 0.2.5 commit at report time. |

## Remaining

1. **Physical launch test:** no Android phone is attached to this workspace. The sandbox Pixel 6/API 36 software emulator could not finish boot without `/dev/kvm`. Install v0.2.5 over v0.2.4 without clearing data, then follow [ANDROID_SMOKE_TEST.md](../ANDROID_SMOKE_TEST.md). This build is not yet confirmed to fix the device symptom. If the readiness screen remains or the app restarts, collect cold-start logcat before clearing app data.
2. **Activate OTA:** no EAS project ID or Expo token has been configured. Add the real project ID and opt-in as GitHub repository variables and `EXPO_TOKEN` as a repository secret, then create a new linked preview APK. The v0.2.5 APK built here is intentionally OTA-disabled and cannot receive EAS updates. Follow [OTA_UPDATES.md](../OTA_UPDATES.md).
3. **Cloud task sync:** remains disabled. API/Cognito identifiers, authenticated API contract, task queue/reconciliation, and explicit sync consent are still missing. No user task data is uploaded. See [CLOUD_SYNC_STATUS.md](../CLOUD_SYNC_STATUS.md).
4. **Store distribution:** this is a local release APK signed with the existing sandbox debug identity, not a Play Store-signed release.

## Privacy and failure boundaries

Task plans, activity, and model files remain in app-private local storage; cloud sync is off. OTA delivers compatible application code/assets only. A JS timer cannot fire if the JS thread is blocked by synchronous native work, so device logs are still needed to identify such a failure. Do not claim the real-device issue is fixed until the phone test passes.
