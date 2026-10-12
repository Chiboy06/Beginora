# Beginora

Beginora is an Android-first, offline-first task-starting and focus aid. It helps a user turn a task they explicitly choose into one manageable first action. It is a planning aid — not medical care, diagnosis, or treatment.

## What it does

You describe something you want to work on. Beginora finds one concrete first action — something you can start in about 30 seconds and do in about five minutes. Then it offers a low-pressure five-minute focus session.

Manual task planning and focus work offline, with a deterministic fallback when no on-device model is installed. Calendar, reminders, voice recognition, Telegram, and model downloads are user-selected; when EAS Updates are configured, the app checks automatically while online and asks before restarting. Some providers may process user-selected data online according to their own policies.

## Current prototype

- Local task planning through the on-device model path, with validated output and a deterministic offline fallback (rule engine).
- Local SQLite plans and outcomes. Manual task entry requires no account, no network, no calendar permission, and no notification permission.
- A low-pressure five-minute focus session, task outcomes (done, snooze, not right, another step), and an optional one-per-task reminder.
- A bounded, user-requested device-calendar review and explicit "prepare for this event" flow.
- A native calendar-editor handoff for user-reviewed appointment drafts. This does not book with a clinic or provider.
- An email composer handoff that creates an editable draft. Beginora never sends email silently.
- Android system speech input that fills an editable draft and never auto-sends it.
- Optional Telegram task summaries with the bot token stored in Android secure storage; sending is user-triggered.
- An opt-in Android background-model service with a generic persistent notification; off by default.
- A capability and privacy registry and a restrained translucent surface treatment.
- EAS Update checks on connectivity for compatible JavaScript/assets, with an explicit user-confirmed restart.
- A first-run disclaimer screen and onboarding gate.
- A deterministic safety pre-check that returns a fixed, human-reviewed response for crisis or medical-treatment content before any model call.

Cloud sync and authentication are intentionally off. Core task data is local. User-selected integrations can send selected data to their named providers. Neon is not needed for the current prototype. EAS Updates is a separate app-code delivery service, not a task-data backend; it is not linked until an EAS project ID and publishing credentials are configured.

## Screens

| Screen | Purpose |
| --- | --- |
| Today | Chat interface — describe a task, get a first action |
| Tasks | Task list with filter chips, first action display, status controls |
| Task detail | First action hero, start focus session, done, snooze, retry, reminder, email handoff |
| Focus | Five-minute timer, pause, resume, finish early, stop |
| Calendar prep | User-requested calendar review, event selection, prepare-for-this flow |
| Settings | Model manager, language, permissions, connections, and disclaimer; no all-data export/delete control is currently exposed |
| Models | Download, select, cancel an active download, and delete on-device models; recovery after process restart is limited |
| Onboarding | First-run disclaimer and product explanation |

## Development

Use Node 22 for the Expo SDK 58 toolchain. A native Android build also needs JDK 17 and the Android SDK/NDK/CMake versions selected by the generated Expo project.

```sh
npm ci --legacy-peer-deps
npm run typecheck
npm test -- --runInBand
npm run lint
npm run audit:ci
```

Native `llama.rn` functionality requires a development or native build. Expo Go is not sufficient. To start Metro for an installed development client:

```sh
npx expo start --dev-client
```

To regenerate the Android project after native dependency or config changes and build locally:

```sh
npx expo prebuild --platform android
cd android
./gradlew app:assembleRelease
```

To build a presentation APK through EAS:

```sh
eas build --profile preview --platform android
```

The sandbox APK is signed with a local debug key and is for testing only, not Play Store distribution. A store release needs an EAS production signing setup.

## Environment and OTA updates

Copy `.env.example` to `.env` for local configuration. Never commit `.env`. Keep `ENABLE_CLOUD_SYNC=false` until an actual sync design and backend are implemented.

To activate connected app-code updates, link an Expo project and set `EAS_PROJECT_ID` in the release build environment. The GitHub workflow also needs repository variable `EAS_PROJECT_ID`, repository variable `EAS_UPDATES_ENABLED=true`, and secret `EXPO_TOKEN`. Compatible updates download when connectivity is available; Beginora asks before restarting. See [OTA setup](docs/OTA_UPDATES.md). OTA updates change JavaScript and assets only. Native dependency or configuration changes require a new binary.

## Permissions

| Permission | Status | Reason |
| --- | --- | --- |
| INTERNET | Keep | Model downloads, user-selected external integrations, and EAS update checks when configured. No analytics or telemetry. |
| POST_NOTIFICATIONS | Keep | Local reminders and the optional background-model service. Runtime request only after the relevant user action. |
| READ_CALENDAR | Keep | Next-event preparation. Runtime request only after the user taps the calendar feature. |
| VIBRATE | Keep | Normal permission; notification feedback. |
| RECEIVE_BOOT_COMPLETED | Keep | Restores scheduled reminders after reboot. |
| WRITE_CALENDAR | Declared | Appointment drafts open the device calendar editor. |
| SET_ALARM | Declared | Available for the alarm intent path. |
| READ_CONTACTS | Declared | Available for contact-lookup features. |
| RECORD_AUDIO | Declared | Requested only when the user taps Android voice input; transcript is returned to an editable draft. |
| FOREGROUND_SERVICE | Declared | Used only when the user opts in to keeping a loaded local model active in the background. |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design record.

Key points:

- Domain code (rule engine, validator, safety pre-check) imports no React Native or Expo module.
- The model has no tools and cannot trigger device actions. Task text and model output are untrusted data.
- Device actions come only from application code through an allowlist.
- Core task planning is local. User-selected integrations are disclosed in the UI; when EAS Updates are enabled for a linked build, the app checks online automatically and requests confirmation only before restart.
- All model output is validated before display. Unvalidated output is never rendered.

## Data

Core task data is stored in a local SQLite database (`beginora.db`) and is not cloud-synced. The current database opener does not configure SQLCipher or an app-managed encryption key. Calendar/email/Telegram interactions send user-selected information to the target provider; voice recognition is handled by the chosen Android speech provider. EAS update checks contact Expo automatically only when an EAS-linked release build is online. The current Settings screen does not expose all-data export or delete-all controls; do not rely on those capabilities until implemented.

## Verification and project notes

- [UnivaBio challenge alignment and demo framing](docs/HACKATHON_ALIGNMENT.md)
- [Dependency security audit status](docs/SECURITY_AUDIT.md)
- [EAS OTA configuration](docs/OTA_UPDATES.md)
- [Architecture decisions log](docs/DECISIONS.md)
- [Android smoke-test checklist](docs/ANDROID_SMOKE_TEST.md)

## Smoke test status

An earlier APK was smoke-tested on the owner's phone, including running a downloaded model. This integration branch changes native speech handling and background-service opt-in behavior, so the rebuilt APK needs a new phone smoke test before its behavior is considered verified.

No passive device monitoring, autonomous actions, direct provider booking, cloud account, or task-data synchronisation is implemented.

## Roadmap (not in this build)

- Dark theme and system theme support
- iOS build and smoke test
- Cloud sync and account (requires backend design)
- Passive focus or paralysis detection
- Hyperfocus detection
- Secure cloud task sync and account (requires backend design)
- Billing
- Clinical efficacy claims (out of scope permanently — this is a planning aid)

## Licence

MIT. See [LICENSE](LICENSE). Upstream Vesta is MIT, copyright Rinaldo Festa.
