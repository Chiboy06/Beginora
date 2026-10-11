# Beginora latest-updates review and integration status

**Reviewed base:** `origin/main` at `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`feat: app update`) in repository `Chiboy06/Beginora`. Repairs are being made on `fix/integrate-latest-updates`.

## Summary

The latest merged update set had several release-blocking integration gaps: missing direct dependencies for imported icon/audio packages, a duplicated Babel transform that stopped Jest before assertions, an onboarding route gate that could remain stale, and an in-app voice button that did not reach the Android speech Activity. Other material issues included a focus-paralysis detector that stopped at the current session's `started` outcome, Telegram credentials in general SQLite config, stale local reminders, sensitive task titles in foreground notifications, plaintext broad-scope MCP access, and privacy copy that overstated local-only behavior.

The integration branch repairs the build and the high-priority paths, preserves the offline-first model, and deliberately disables MCP until its transport and source scopes are safe. It adds a network-triggered EAS Update check, but it **cannot receive repository-published updates yet** because no EAS project ID or publishing token is configured for this repository/workspace.

## Repairs implemented

- Added and locked the missing `@expo/vector-icons`, `expo-network`, and `expo-font` dependencies; removed the unresolved `expo-av` dependency path in favor of the existing native Android speech Activity.
- Removed duplicate Reanimated/Worklets Babel registration and fixed the strict decomposer response typing.
- Reworked onboarding completion into a reactive persisted store so the root gate changes as soon as onboarding is completed.
- Connected Android voice input end to end: native Activity-result bridge, permission denial/cancel/unavailable results, editable chat-draft insertion (never auto-send), deep-link route for widget/quick-chat launches, and iOS voice control hidden in this Android-first build.
- Fixed focus detection to skip the current session's `started` marker; added sequence tests for paralysis threshold, completion/retry resets, long-session detection, and storage failure.
- Added task-reminder cancellation on task completion/deletion, cleanup when notification-ID persistence fails, generic lock-screen reminder copy, notification metadata, and task/appointment notification-tap routing. Appointment reminder keys now remain stable when an event moves so a replacement can cancel the old alert.
- Moved Telegram bot tokens from SQLite config to Android SecureStore with best-effort legacy migration, explicit save/remove controls, and user-triggered sending. Telegram reminders are not exposed as active because no reminder caller is implemented.
- Made background-model retention opt-in, requested notification permission only after the user enables it, and removed private task titles from persistent notification content.
- Replaced static connection badges with read-only permission/readiness checks for calendar, contacts, microphone, notifications, email availability, Telegram configuration, EAS linkage, and background mode. The status screen does not request permissions and does not expose credentials.
- Corrected calendar/email handoff wording so it does not claim a provider cannot sync user-saved calendar events or claim that a returned mail composer means the message was sent/saved.
- Disabled the Android plaintext HTTP MCP server at the service boundary; startup stops any legacy listener and revokes stored pairings. The app explains why the feature is unavailable rather than implying encrypted or per-source access.
- Split EAS update download from restart. On connectivity/foreground the app checks and downloads compatible JavaScript/assets, then asks the user before restarting; Settings also allows a manual check.
- Corrected onboarding/Settings/README/OTA copy to distinguish local core task data from optional provider handoffs and update checks.

## Validation completed

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test -- --runInBand` | Pass — 40 suites, 264 tests |
| `CI=1 npx expo install --check` | Pass — SDK-managed dependencies aligned |
| `npx expo-doctor` | Pass — 20/20 checks after adding the Expo Font peer |
| `npm run audit:ci` | Pass under the exact-advisory policy; 57 audit finding instances (30 moderate, 27 high, 0 critical), with two known upstream advisory IDs explicitly allowlisted because no patched package versions were available at the last registry check |
| `npx expo prebuild --platform android --clean --no-install` | Pass; generated manifest includes voice/notification permissions, voice Activity, foreground service, and `SystemActionsPackage` |
| `npx expo export --platform android` | Pass — Android JS bundle exported (about 8.1 MB) |
| App configuration | Pass — version 0.2.0, Android versionCode 2, OTA explicitly disabled without EAS credentials |
| Android release APK compile | Pass — `app.beginora.android` version 0.2.0 / versionCode 2; 187,607,760-byte APK; ZIP integrity, zipalign, embedded JS bundle, and APK signature verified |
| APK signing compatibility | Pass — the new APK uses the same Android Debug certificate SHA-256 as the previously tested APK, so Android should permit an in-place install/update |

The audit-policy pass is **not** a claim that the npm graph is vulnerability-free. Recheck advisory fix availability before store release.

## Remaining work and external dependencies

1. **EAS Updates are not active yet.** Configure repository variable `EAS_PROJECT_ID`, repository variable `EAS_UPDATES_ENABLED=true`, and GitHub secret `EXPO_TOKEN`; then build/install a new APK linked to the same EAS project/runtime/channel. Until then, the app remains offline-capable but cannot fetch repo-published changes. See [`docs/OTA_UPDATES.md`](../OTA_UPDATES.md).
2. **Cloud task sync/authentication are still disabled and incomplete.** No user-task backend is implemented, and Neon is not required for this offline prototype. Keep cloud sync off until an authenticated HTTPS API, consent, deletion, and retry contract exist.
3. **Install and smoke-test the new native APK on the owner’s phone.** The previously tested APK predates these native voice/service changes. The package and debug signing certificate match, so this build should install over it without uninstalling or clearing local data. Verify onboarding, voice permission/result/cancel, chat draft (without auto-send), reminder taps/cancellation, calendar, email composer, Telegram save/remove/send, background-service opt-in/off, and ordinary offline task/model behavior.
4. **A few source-level lifecycle gaps remain.** Examples include atomic/retryable persistence for every multi-step task/document/chat write, newest-first conversation pagination, and reconciliation of appointment notifications after a calendar event is deleted. These do not block the currently validated local task/focus MVP but should remain tracked before a broader release.
5. **The full product brief is larger than this build.** iOS native verification, an authenticated cloud account/sync service, the wider coaching/product experience, store signing, and hackathon submission materials are separate follow-up work.

## Safety and data boundaries in this branch

- Core tasks/plans/outcomes remain in local SQLite; cloud sync is off.
- Voice capture is Android system speech recognition and its network/retention behavior depends on the selected provider. The transcript is placed in an editable draft; Beginora does not auto-send it.
- Email handoff opens the user’s email app; Beginora does not send mail silently.
- Telegram sends only when the user explicitly requests a task summary/test. The selected message and chat ID go to Telegram; the token is held in Android secure storage.
- EAS update checks contact Expo only for a real EAS-linked release build with connectivity. Downloaded code is not applied until the user confirms a restart.
- The foreground Android service is off by default, starts only after explicit opt-in and an on-device model load, and uses generic notification text.
- MCP is unavailable until encrypted transport and per-source permissions are implemented and verified.
