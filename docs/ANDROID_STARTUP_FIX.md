# Android startup diagnosis and mitigations

## What the latest phone screenshot shows

The Oct 13 screenshot displays Beginora's React “Getting your tasks ready…” view. This proves the React root layout rendered in that capture; the visible screen is not Android's native splash. It does not, by itself, show whether the process stayed alive in the readiness gate or repeatedly restarted and returned to it.

## Changes made

- **0.2.1:** bounded the root readiness wait to 1.5 seconds, moved selected-model restoration and cache warm-up out of blocking app initialization, and replaced the Expo placeholder launch art.
- **0.2.4:** removed the module-scope `SplashScreen.preventAutoHideAsync()` call that could pin the native splash before React mounted. The user's follow-up screenshot showed this did not clear the launch symptom.
- **0.2.5:** defers chat/task startup functions until the readiness deadline is armed, so a synchronous exception cannot occur before the timeout is registered. Legacy MCP shutdown is still attempted, but no longer blocks the task/chat UI from becoming ready. Startup errors and timeout status are logged for device diagnostics.

The 0.2.5 change is a focused fail-open mitigation, not a confirmed root-cause fix. If the JavaScript thread is synchronously blocked indefinitely, its timer cannot run; cold-start Android logs are then needed to identify the native call or runtime failure.

## Phone validation

Install v0.2.5 over v0.2.4 without clearing app data. The readiness message should clear within a few seconds, even if a previously selected local model is still loading. If it remains or the app restarts, capture cold-start logs and include the phone model, Android version, whether the screen stayed put or restarted, and whether a local model had been selected. Use the steps in [ANDROID_SMOKE_TEST.md](ANDROID_SMOKE_TEST.md). Redact private task and personal data; do not uninstall or clear storage before logs are captured.

## Earlier validation boundary

The sandbox's software-only Pixel 6/API 36 emulator could not complete first boot because hardware acceleration (`/dev/kvm`) is unavailable. Android prebuild/export/Gradle APK success is not evidence of successful execution on the user's phone. A real-device run remains required before calling the launch issue fixed.
