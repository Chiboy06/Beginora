# Android startup hotfix — 0.2.1

## Diagnosis

The root navigator kept the entire application behind a full-screen loading view until `Promise.all` finished chat initialization, task loading, and legacy MCP shutdown. Chat initialization also awaited restoration of the selected native LLM and its optional KV/session-cache warm-up. A large model, device memory pressure, or a stalled native load could therefore leave the app on its centered blinking loader indefinitely. This is a concrete failure path consistent with the reported screen; without the phone's startup log, it cannot be confirmed as the only cause of that specific launch.

The configured splash artwork was also an Expo placeholder rather than Beginora artwork, making the launch screen look unfinished.

## Fix

- The root navigator now releases the app shell when initialization finishes **or after 1.5 seconds**, whichever happens first. Database/model work continues without blocking navigation.
- The native splash is explicitly dismissed on the first React layout; the short startup view is branded and descriptive.
- Saved-model restoration and cache warm-up now run in the background. The chat screen shows “Preparing your on-device model…” while the native model loads and surfaces the existing warning if loading fails.
- Replaced the Expo placeholder launcher/adaptive/splash marks with a simple sage sprout matching the app palette; the splash image is explicitly sized.
- Bumped the Android build to app version `0.2.1`, `versionCode` `3`, so it can update the previous `0.2.0` test install when signed with the same key.

## Validation

- `npm run typecheck` — passed.
- `npm test -- --runInBand` — **43 suites, 276 tests passed**, including a regression test with a deliberately stalled native model load.
- `npm run lint` — passed.
- `npx expo-doctor` — 20/20 checks passed.
- `CI=1 npx expo install --check` — dependencies aligned.
- `npx expo prebuild --platform android --clean --no-install` and Android production JS export — passed.
- Full Android-device launch remains to be confirmed. The sandbox's software-only Pixel 6/API 36 emulator did not finish first boot without hardware acceleration, so it could not install/run the app.

If the 0.2.1 APK still blinks indefinitely on the phone, the next diagnostic should be the first-launch Android logcat (`AndroidRuntime`, `ReactNativeJS`, and Expo startup messages); that would distinguish a native crash or bundle-load error from slow local-model initialization.
