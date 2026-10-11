# Beginora

Beginora is an Android-first, offline-first task-starting and focus aid. It helps a user turn a task they explicitly choose into one manageable first action. It is a planning aid — not medical care, diagnosis, or treatment.

## What it does

You describe something you want to work on. Beginora finds one concrete first action — something you can start in about 30 seconds and do in about five minutes. Then it offers a low-pressure five-minute focus session.

The core flow works with no account, no network connection (after model install), no calendar permission, and no notification permission.

## Current prototype

- Local task planning through the on-device model path, with validated output and a deterministic offline fallback (rule engine).
- Local SQLite plans and outcomes. Manual task entry requires no account, no network, no calendar permission, and no notification permission.
- A low-pressure five-minute focus session, task outcomes (done, snooze, not right, another step), and an optional one-per-task reminder.
- A bounded, user-requested device-calendar review and explicit "prepare for this event" flow.
- A native calendar-editor handoff for user-reviewed appointment drafts. This does not book with a clinic or provider.
- An email composer handoff that creates an editable draft. Beginora never sends email silently.
- A capability and privacy registry and a restrained translucent surface treatment.
- An optional EAS Update check for compatible JavaScript and assets.
- A first-run disclaimer screen and onboarding gate.
- A deterministic safety pre-check that returns a fixed, human-reviewed response for crisis or medical-treatment content before any model call.

Cloud sync and authentication are intentionally off. Task data is local. Neon is not needed for the current prototype. EAS Updates is a separate app-code delivery service, not a task-data backend.

## Screens

| Screen | Purpose |
| --- | --- |
| Today | Chat interface — describe a task, get a first action |
| Tasks | Task list with filter chips, first action display, status controls |
| Task detail | First action hero, start focus session, done, snooze, retry, reminder, email handoff |
| Focus | Five-minute timer, pause, resume, finish early, stop |
| Calendar prep | User-requested calendar review, event selection, prepare-for-this flow |
| Settings | Model manager, language, permissions, data export, delete all data, disclaimer |
| Models | Download, pause, resume, delete on-device models |
| Onboarding | First-run disclaimer and product explanation |

## Development

Use Node 22 for the Expo SDK 55 toolchain. A native Android build also needs JDK 17 and the Android SDK/NDK/CMake versions selected by the generated Expo project.

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

To activate Settings → Check for updates, link an Expo project and set `EAS_PROJECT_ID` in the release build environment. The GitHub workflow also needs repository variable `EAS_PROJECT_ID`, repository variable `EAS_UPDATES_ENABLED=true`, and secret `EXPO_TOKEN`. See [OTA setup](docs/OTA_UPDATES.md). OTA updates change JavaScript and assets only. Native dependency or configuration changes require a new binary.

## Permissions

| Permission | Status | Reason |
| --- | --- | --- |
| INTERNET | Keep | Model download only. No analytics or telemetry. |
| POST_NOTIFICATIONS | Keep | Focus-end and task reminders. Runtime request only when the user starts a timer or enables a reminder. |
| READ_CALENDAR | Keep | Next-event preparation. Runtime request only after the user taps the calendar feature. |
| VIBRATE | Keep | Normal permission; notification feedback. |
| RECEIVE_BOOT_COMPLETED | Keep | Restores scheduled reminders after reboot. |
| WRITE_CALENDAR | Declared | Appointment drafts open the device calendar editor. |
| SET_ALARM | Declared | Available for the alarm intent path. |
| READ_CONTACTS | Declared | Available for contact-lookup features. |
| RECORD_AUDIO | Declared | Available for voice input features. |
| FOREGROUND_SERVICE | Declared | Available for background service features. |

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design record.

Key points:

- Domain code (rule engine, validator, safety pre-check) imports no React Native or Expo module.
- The model has no tools and cannot trigger device actions. Task text and model output are untrusted data.
- Device actions come only from application code through an allowlist.
- No network call occurs in the core flow. The only network use is the user-initiated model download.
- All model output is validated before display. Unvalidated output is never rendered.

## Data

All task data is stored in a local SQLite database (`beginora.db`). No data is sent to any server. The Settings screen provides export (JSON via the system share sheet) and delete-all-data options.

## Verification and project notes

- [UnivaBio challenge alignment and demo framing](docs/HACKATHON_ALIGNMENT.md)
- [Dependency security audit status](docs/SECURITY_AUDIT.md)
- [EAS OTA configuration](docs/OTA_UPDATES.md)
- [Architecture decisions log](docs/DECISIONS.md)
- [Android smoke-test checklist](docs/ANDROID_SMOKE_TEST.md)

## Smoke test status

The app has not yet been built or smoke-tested on the current native rebuild. An earlier APK ran a downloaded model on the owner's phone. The current native rebuild must be tested again after installation.

No passive device monitoring, autonomous actions, direct provider booking, cloud account, or task-data synchronisation is implemented.

## Roadmap (not in this build)

- Dark theme and system theme support
- iOS build and smoke test
- Cloud sync and account (requires backend design)
- Passive focus or paralysis detection
- Hyperfocus detection
- Telegram integration
- Billing
- Clinical efficacy claims (out of scope permanently — this is a planning aid)

## Licence

MIT. See [LICENSE](LICENSE). Upstream Vesta is MIT, copyright Rinaldo Festa.
