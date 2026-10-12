# Beginora startup comparison with original Vesta

**Date:** 2026-10-12  
**Purpose:** Investigate the physical-device report that Beginora remains on a blinking/persistent launch screen. This is a source-level comparison; no Android device is attached to this environment, so it does not identify a confirmed runtime crash.

## Short conclusion

The strongest verified code-level match to the symptom is Beginora's module-scope `SplashScreen.preventAutoHideAsync()`. Vesta does not pin the native splash; it renders a React loading indicator while initialization runs. Beginora's retryable splash-hide helper only starts after `RootLayout` commits, so it cannot release a splash held before that point. The 0.2.4 diagnostic change removes the manual hold while leaving the post-mount best-effort hide in place.

The other major difference is the framework cohort: Vesta uses stable Expo SDK 55 / React Native 0.83.2; the current Beginora candidate uses Expo SDK 58 beta / React Native 0.88.0-rc.4. That is a legitimate native-runtime risk, but not a proven package mismatch. Expo's SDK 58 direct packages were aligned with its bundled map and Expo Doctor passed. A device log is still needed before changing the framework or third-party native packages.

## Package and startup comparison

| Area | Original Vesta source | Beginora 0.2.3 before diagnostic change | Assessment |
|---|---|---|---|
| Expo / React / React Native | Expo `~55.0.5`, React `19.2.0`, RN `0.83.2` | Expo `^58.0.7`, React `19.3.0`, RN `0.88.0-rc.4` | The SDK 58 post is explicitly a beta and uses an RN release candidate. Higher native compatibility risk than Vesta's stable baseline; not proof by itself. |
| Expo-managed modules | SDK 55 versions | SDK 58 versions | The current packages matched the SDK 58 bundled-version map; prior Expo Doctor was 20/20. No direct Expo-managed version mismatch was demonstrated. |
| LLM native bridge | `llama.rn ^0.11.4` | `llama.rn ^0.11.4` | Shared version. Beginora uses it with a newer prerelease RN runtime, so native integration still merits device logs. |
| Preferences | Vesta manifest has no MMKV dependency; it uses Expo SQLite | Beginora uses `react-native-mmkv ^3.3.3`, instantiated from `lib/store/prefs.ts` at import time | A meaningful non-Expo native/JSI difference and a plausible early-import failure point, but not proven. MMKV v3 requires New Architecture and RN 0.75+; a build-time architecture/package check is not a runtime test. |
| Native splash | No `preventAutoHideAsync`; normal Expo first-frame dismissal, then React ActivityIndicator during `init()` | Module-level `preventAutoHideAsync`; explicit hide is attempted only after RootLayout mounts | A direct behavioral difference that can leave the native splash intentionally pinned if startup fails before the first React commit. This is the narrowest reversible mitigation. |
| Startup readiness | Waits for `init()` before showing routes | Has a bounded readiness gate and restores the model in the background | A slow local model alone should not block Beginora's app shell; that was already addressed in 0.2.3. |

The app was released as a Gradle production APK with an embedded JS bundle. It does not use Metro Fast Refresh at runtime; a repeated launch/splash symptom in this APK should be diagnosed as startup/UI or native-runtime behavior, not described as repeated development bundling.

## Diagnostic change and what it does not prove

Beginora 0.2.4 removes the module-level call that prevents Expo from auto-hiding the native splash. The existing `hideAsync()` retry remains as an eager best-effort after React mounts. This mirrors Vesta's default splash lifecycle and avoids intentionally trapping users on the native launch screen before the app tree can report readiness. It is a diagnostic mitigation, not evidence that the root cause is fixed: a module registration problem or other native crash may still occur.

No dependency was downgraded in this change. The SDK 58 package set is internally aligned, and a broad downgrade without device logs that identify the exception would risk changing multiple native integrations without isolating the fault. If 0.2.4 still blinks, collect cold-start Android logcat and identify the first `FATAL EXCEPTION`, `AndroidRuntime`, `ReactNativeJS`, MMKV, or `llama` error before changing SDK/RN or removing a native dependency.

## Evidence needed from the phone

Install the diagnostic APK over 0.2.3, launch once, and capture cold-start logs using the steps in [ANDROID_SMOKE_TEST.md](../ANDROID_SMOKE_TEST.md). Please include phone model and Android version, and whether a local model had previously been downloaded/selected. Do not clear app data or uninstall the previous build before collecting logs; redact task text and other private data.

## Sources

- Original Vesta repository: [RisorseArtificiali/vesta](https://github.com/RisorseArtificiali/vesta)
- Vesta mobile manifest: [apps/mobile/package.json](https://raw.githubusercontent.com/RisorseArtificiali/vesta/main/apps/mobile/package.json)
- Vesta root layout: [apps/mobile/app/_layout.tsx](https://raw.githubusercontent.com/RisorseArtificiali/vesta/main/apps/mobile/app/_layout.tsx)
- Beginora reviewed branch manifest: [package.json](https://raw.githubusercontent.com/Chiboy06/Beginora/fix/eas-ota-explicit-opt-in/package.json)
- Beginora reviewed branch root layout: [app/_layout.tsx](https://github.com/Chiboy06/Beginora/blob/fix/eas-ota-explicit-opt-in/app/_layout.tsx)
- Expo: [SDK 58 beta announcement](https://expo.dev/changelog/sdk-58-beta)
- MMKV: [v3 requirements and docs](https://github.com/margelo/react-native-mmkv/blob/main/README_V3.md)
- Shared LLM bridge: [llama.rn](https://github.com/mybigday/llama.rn)
