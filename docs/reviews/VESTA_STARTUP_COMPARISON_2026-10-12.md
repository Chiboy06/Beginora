# Beginora startup comparison with original Vesta

**Date:** 2026-10-12  
**Purpose:** Investigate the physical-device report that Beginora remains on a blinking/persistent launch screen. This is a source-level comparison; no Android device is attached to this environment, so it does not identify a confirmed runtime crash.

## Short conclusion

The module-scope `SplashScreen.preventAutoHideAsync()` was a real difference from Vesta, so 0.2.4 removed that hold. However, the user's Oct 13 screenshot shows Beginora's own React “Getting your tasks ready…” view, which means `RootLayout` had rendered; the native splash was not the visible screen in that capture. The remaining investigation is therefore the app-level readiness gate or a process restart that repeatedly returns to it. The screenshot alone cannot distinguish those cases.

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

Beginora 0.2.4 removes the module-level call that prevents Expo from auto-hiding the native splash. The existing `hideAsync()` retry remains as an eager best-effort after React mounts. This mirrors Vesta's default splash lifecycle, but the user's later screenshot shows it did not resolve the reported launch symptom.

The 0.2.5 follow-up defers chat/task initialization until after the readiness timeout is armed and runs legacy MCP shutdown outside the UI readiness gate. This addresses a synchronous-startup failure path in the gate, but it remains a candidate mitigation until tested on the user's phone. No dependency was downgraded: the SDK 58 package set is aligned, and a broad downgrade without device logs would change multiple native integrations without isolating the fault.

## Evidence needed from the phone

Install 0.2.5 over 0.2.4, launch once, and capture cold-start logs using the steps in [ANDROID_SMOKE_TEST.md](../ANDROID_SMOKE_TEST.md) if “Getting your tasks ready…” remains or the app restarts. Include phone model and Android version, whether the screen stayed in place or restarted, and whether a local model had previously been selected. Do not clear app data or uninstall before collecting logs; redact task text and other private data.

## Sources

- Original Vesta repository: [RisorseArtificiali/vesta](https://github.com/RisorseArtificiali/vesta)
- Vesta mobile manifest: [apps/mobile/package.json](https://raw.githubusercontent.com/RisorseArtificiali/vesta/main/apps/mobile/package.json)
- Vesta root layout: [apps/mobile/app/_layout.tsx](https://raw.githubusercontent.com/RisorseArtificiali/vesta/main/apps/mobile/app/_layout.tsx)
- Beginora reviewed branch manifest: [package.json](https://raw.githubusercontent.com/Chiboy06/Beginora/fix/eas-ota-explicit-opt-in/package.json)
- Beginora reviewed branch root layout: [app/_layout.tsx](https://github.com/Chiboy06/Beginora/blob/fix/eas-ota-explicit-opt-in/app/_layout.tsx)
- Expo: [SDK 58 beta announcement](https://expo.dev/changelog/sdk-58-beta)
- MMKV: [v3 requirements and docs](https://github.com/margelo/react-native-mmkv/blob/main/README_V3.md)
- Shared LLM bridge: [llama.rn](https://github.com/mybigday/llama.rn)
