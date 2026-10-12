# Beginora release-readiness review — 2026-10-12

**Candidate:** v0.2.4 / Android `versionCode` 6 (`app.beginora.android`). This candidate includes the focused splash-lifecycle diagnostic and a network-aware manual EAS update check. The source comparison with the original Vesta app is in [VESTA_STARTUP_COMPARISON_2026-10-12.md](VESTA_STARTUP_COMPARISON_2026-10-12.md). See the [comprehensive functional audit](COMPREHENSIVE_FUNCTIONAL_AUDIT_2026-10-12.md) for the wider MVP review and evidence boundaries.

## Implemented

- **Startup/splash:** removed Beginora's module-scope `SplashScreen.preventAutoHideAsync()` call so Expo's default native splash dismissal is not intentionally disabled before RootLayout mounts. The post-mount best-effort hide/retry remains; the app shell still has bounded readiness and model restoration remains in the background. This is a diagnostic mitigation, not a confirmed physical-device fix.
- **Manual repository update:** Settings already had a manual EAS check/download action; it now explicitly detects an offline device and reports that no network check was made. The card explains that only compatible JavaScript/interface updates published from the repo to the EAS preview channel can be downloaded, and that the user chooses whether to restart. Native changes still require a new APK; task data remains local.
- **Publishing path:** the gated GitHub Actions EAS workflow now includes the current preview branch alongside the existing publish branches. It still skips until repository variable `EAS_UPDATES_ENABLED=true` is set, and requires `EAS_PROJECT_ID` plus the `EXPO_TOKEN` secret.
- **Other MVP behavior:** task/model/reminder reliability, onboarding, privacy boundaries, and safe offline operation remain as reviewed in the [comprehensive functional audit](COMPREHENSIVE_FUNCTIONAL_AUDIT_2026-10-12.md).

## Validation

| Check | Result |
|---|---|
| Dependency install / postinstall | Pass with unchanged dependency graph. The prior clean `npm ci --legacy-peer-deps` verification remains applicable; the compatibility patcher was rerun and completed idempotently. No package versions changed for 0.2.4. |
| TypeScript | Pass |
| Expo lint | Pass |
| Jest | Pass — 48 suites, 300 tests |
| Expo Doctor | Pass — 20/20 checks on the unchanged dependency graph |
| Expo SDK dependency check | Pass — no package changes since the prior aligned SDK 58 check |
| Security policy (`npm run audit:ci`) | Pass on the unchanged dependency graph — 57 advisory instances (30 moderate, 27 high, 0 critical). Two known upstream advisory IDs remain explicitly allowlisted because no patched published version was available at the last registry check. This is not a vulnerability-free dependency graph. |
| Clean Expo Android prebuild | Pass |
| Android JS bundle | Pass — Gradle bundled 1,488 modules; embedded `assets/index.android.bundle` is present |
| Resolved app config | Pass — version 0.2.4/code 6; OTA disabled, no EAS URL/project ID; API URL unset and cloud sync disabled |
| Android release APK | Pass — package `app.beginora.android`, version 0.2.4/code 6, 187,516,360 bytes. ZIP integrity and 4-byte alignment verified; SHA-256: `b8507c2965845bd8c15be443044ad0065af6664115d94b9202685887ba87331a`. Debug signer SHA-256 matches v0.2.3 (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`), supporting an in-place upgrade. |
| GitHub PR #3 CI | Awaiting the current commit's push/checks. |

## Remaining device and service setup

1. **Physical launch test:** no Android phone or usable emulator is attached to the sandbox; the software AVD could not boot without `/dev/kvm`. The APK build succeeding is not evidence that the phone launch loop is fixed. Install the supplied v0.2.4 APK over 0.2.3 and follow [ANDROID_SMOKE_TEST.md](../ANDROID_SMOKE_TEST.md). If it still blinks, capture cold-start Android logs before clearing app data.
2. **Activate repository-to-app updates:** the current APK is intentionally not OTA-linked and the resolved config reports `updates.enabled=false`. The Settings button therefore reports that OTA is not connected; it cannot fetch repository changes in this APK yet. The owner must supply/configure a real EAS project ID, set GitHub Actions variables `EAS_PROJECT_ID` and `EAS_UPDATES_ENABLED=true`, add `EXPO_TOKEN` as a GitHub Actions secret, and then install a newly built APK linked to that EAS project. GitHub Actions variables/secrets could not be inspected from this session, so their saved state is unknown. See [OTA_UPDATES.md](../OTA_UPDATES.md). OTA only updates compatible JavaScript/assets; it is not task-data sync.
3. **Cloud task sync:** no working backend is configured. `api.beginora.app` did not resolve earlier; the reachable API URL and Cognito pool/client/region remain unprovided, and local task changes are not yet enqueued/reconciled end-to-end. Sync remains disabled; no task data is uploaded. See [CLOUD_SYNC_STATUS.md](../CLOUD_SYNC_STATUS.md).
4. **Release signing/distribution:** the APK uses the sandbox debug signing identity. Store signing and Play/App Store distribution are not configured.

## Current privacy boundaries

- Task plans, activity and model files remain in local app-private storage; cloud sync is off.
- Calendar permissions are requested only after user action; events saved through the device calendar may sync with the calendar provider.
- Email opens the device composer; Beginora does not silently send mail.
- Voice recognition is Android/provider-dependent and may use a network, but transcripts remain editable and are not auto-submitted.
- Telegram sends only after a user-triggered action; selected content goes to Telegram.
- EAS checks remain unavailable until a linked, explicitly enabled build is installed.
- MCP remains unavailable until transport and source-level authorization are implemented and verified.
