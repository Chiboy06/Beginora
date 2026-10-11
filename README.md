# Beginora

Beginora is an Android-first, offline-first task-starting and focus aid. It helps a user turn a task they explicitly choose into one manageable first action. It is a planning aid—not medical care, diagnosis, or treatment.

## Current prototype

- Local task planning through the existing on-device model path, with validated output and deterministic offline fallback.
- Local SQLite plans and outcomes; manual task entry does not require an account, network, calendar permission, or notification permission.
- A low-pressure five-minute focus session, task outcomes, and an optional one-per-task reminder.
- A bounded, user-requested device-calendar review and explicit “prepare for this event” flow.
- A native calendar-editor handoff for user-reviewed appointment drafts. This does **not** book with a clinic or provider.
- An email composer handoff that creates an editable draft; Beginora never sends email silently.
- A capability/privacy registry and a restrained translucent surface treatment.
- An optional EAS Update check for compatible JavaScript/assets, and a guarded GitHub preview-publish workflow.

Cloud sync/authentication is intentionally off. Task data is local; **Neon is not needed** for the current prototype. EAS Updates is a separate app-code delivery service, not a task-data backend.

## Development

Use Node 22 for the Expo SDK 58 toolchain. A native Android build also needs JDK 17 and the Android SDK/NDK/CMake versions selected by the generated Expo project.

```sh
npm ci --legacy-peer-deps
npm run typecheck
npm test -- --runInBand
npm run lint
npm run audit:ci
```

Native `llama.rn` functionality requires a development/native build; Expo Go is not sufficient. To start Metro for an installed development client:

```sh
npx expo start --dev-client
```

To regenerate the Android project after native dependency/config changes and build locally:

```sh
npx expo prebuild --platform android
cd android
./gradlew app:assembleRelease
```

The sandbox APK is signed with a local debug key and is for testing only, not Play Store distribution. A store release needs an EAS/production signing setup.

## Environment and OTA updates

Copy `.env.example` to `.env` for local configuration; never commit `.env`. Keep `ENABLE_CLOUD_SYNC=false` until an actual sync design and backend are implemented.

To activate **Settings → Check for updates**, link an Expo project and set `EAS_PROJECT_ID` in the release build environment. The GitHub workflow also needs repository variable `EAS_PROJECT_ID`, repository variable `EAS_UPDATES_ENABLED=true`, and secret `EXPO_TOKEN`. See [OTA setup](docs/OTA_UPDATES.md). OTA updates change JavaScript and assets only; native dependency/configuration changes require a new binary.

## Verification and project notes

- [UnivaBio challenge alignment and demo framing](docs/HACKATHON_ALIGNMENT.md)
- [Dependency security audit status and temporary exact-advisory policy](docs/SECURITY_AUDIT.md)
- [EAS OTA configuration](docs/OTA_UPDATES.md)

The app has not yet been built or smoke-tested on iOS. The user has smoke-tested an earlier Android APK and verified an on-device model on their phone; the current native rebuild must be tested again after installation. No passive device monitoring, autonomous actions, direct provider booking, cloud account, or task-data synchronization is implemented.
