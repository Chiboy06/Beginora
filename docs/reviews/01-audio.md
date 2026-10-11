# Beginora Audio Input Audit

**Scope:** Voice and audio input only: `VoiceButton`, native voice-input helper, chat input, task creation, app/native configuration, related deep-link handling, and audio tests.

**Checkout:** `/home/ubuntu/Beginora-latest`, `HEAD=6e20db88852138cd7bdba6a9c62c7434a76545fa` (the requested `origin/main` baseline). Static review only. No `.env` files were read; no application source was changed. No Android/iOS device or emulator run was performed.

## Executive assessment

**Status: broken for the primary in-app voice button; partially wired for the Android widget/native-activity path.** The chat UI asks for microphone permission and then opens `beginora://voice`, but the native voice activity is registered as a non-exported activity without a matching URL intent filter. The app's JavaScript deep-link handler only handles `beginora://chat` / `/chat`, not `beginora://voice`. Static code therefore does not connect the primary button's URL to `BeginoraVoiceActivity`. In addition, the voice helper imports `expo-av`, which is absent from both dependency manifests; the project typecheck reports this unresolved module. The separately invoked native Activity does contain a recognizer/result-to-chat path, but that is reached explicitly from the Android widget, not by the chat button, and was not tested on a device.

## Reconstructed call paths

### Chat composer voice button (intended path; broken at dispatch)

1. `components/ChatInput.tsx:46-50` renders `VoiceButton` in the input row; it disables the control while chat is unavailable or generating.
2. `components/VoiceButton.tsx:15-25` checks Android, calls `requestMicPermission()`, and displays the returned denial message. `lib/native/voice-input.ts:32-40` implements that call by invoking `ExpoAV.Audio.requestPermissionsAsync()` and returning permission readiness only; it does not start recognition or return transcript text.
3. `components/VoiceButton.tsx:27-35` then calls `Linking.openURL("beginora://voice")`. The adjacent comment says this launches `BeginoraVoiceActivity`, but the native config does not associate that URI with that activity. `plugins/with-system-actions.js:188-201` registers the Activity with `android:exported="false"` and no intent filter. The app-level URL handler at `app/index.tsx:120-139` accepts only hostname `chat` or pathname `/chat`; a `voice` host is ignored.
4. Consequently, repository code provides no demonstrated path from this UI URL to `BeginoraVoiceActivity`. `app.json:9` configures the `beginora` scheme, but that alone is not evidence that the `voice` URL launches the native Activity. Runtime routing was not tested.

### Android widget → native Activity → chat draft (statically connected; runtime unverified)

1. `native/android/src/main/java/app/beginora/android/BeginoraWidgetProvider.kt:52-59` creates an explicit `PendingIntent` for `BeginoraVoiceActivity` when the widget mic is tapped. `app.json:70` enables the `with-system-actions` config plugin, which copies native Android source/resources (`plugins/with-system-actions.js:30-86`) and registers the voice Activity (`:188-201`).
2. `BeginoraVoiceActivity.kt:22-50` checks/requests `RECORD_AUDIO`; `:54-67` launches Android `RecognizerIntent.ACTION_RECOGNIZE_SPEECH`; `:69-86` reads the first result and starts `MainActivity` with `beginora://chat?voice_text=...`.
3. `app/index.tsx:120-148` handles initial and subsequent linking events. For a `chat` URL containing `voice_text`, it truncates the text to 1,000 characters and puts it into the chat input draft/focuses the field (`:125-133`). `components/ChatInput.tsx:28-35,37-42` keeps that text in component state until the user sends it; the deep link does not itself submit it.
4. This source-level route is coherent, but no generated manifest, build, recognition-provider availability, microphone prompt, cancel path, or transcript return was exercised on a device. It is therefore not claimed to work at runtime.

### Other entry surfaces

- `components/FloatingBubble.tsx:77-89` also opens `beginora://voice` directly, bypassing `requestMicPermission()` and swallowing open failures (`:80-83`). It shares the chat button's URL mismatch and has no user-facing error state.
- `app/task/new.tsx:65-90` contains title/context text inputs and no `VoiceButton` or audio handler. The native result path described above only pre-fills chat, not this task form.

## Findings

### 1. High — Main chat voice URI does not target the native recognizer

**Evidence:** `components/VoiceButton.tsx:27-30` opens `beginora://voice` while claiming it launches `BeginoraVoiceActivity`. The plugin registers the Activity only as a non-exported component, with no URL filter: `plugins/with-system-actions.js:188-201`. The sole JS result/deep-link receiver only processes `chat` host or `/chat` paths: `app/index.tsx:120-139`. `BeginoraVoiceActivity` is explicitly launched by the widget at `BeginoraWidgetProvider.kt:52-59`, not by a JS/native-module call from `VoiceButton`.

**Impact:** The principal voice button has no statically wired route into the recognizer; it can open the app/deep-link path without starting speech capture or receiving a transcript. The floating-bubble shortcut uses the same URI.

**Suggested fix:** Provide a real native bridge/API to launch the Activity, or add an explicit and secure deep-link/intent dispatch to it; ensure `beginora://voice` has a deliberate receiver. Keep the existing `chat?voice_text=` result handling and cover both cold-start and warm-app return paths with tests.

**Confidence:** High for the source/config mismatch; device behavior remains unverified.

### 2. High — Voice UI/service imports are missing declared dependencies

**Evidence:** `lib/native/voice-input.ts:7` imports `expo-av`; `components/VoiceButton.tsx:3` imports `@expo/vector-icons`. Neither is in `package.json:18-52` or the root dependency list in `package-lock.json:11-45`. `npm ls expo-av expo-speech-recognition --depth=0` reported no installed voice package. A read-only `npm run typecheck -- --pretty false` failed with `TS2307` for `expo-av` at `lib/native/voice-input.ts:7` and `@expo/vector-icons` at `components/VoiceButton.tsx:3` (also at `FloatingBubble.tsx:24`). The typecheck additionally reports an unrelated existing `lib/ai/decomposer.ts` type error.

**Impact:** A clean dependency install/typecheck cannot resolve the voice service or icon imports; bundling/building the code that imports them is at risk of failing before voice can run. The native `RecognizerIntent` implementation does not replace the missing JS dependency because the service still imports `expo-av`.

**Suggested fix:** Add only the intended supported packages to `package.json` and lockfile, or remove/replace unused dependencies with an implemented native permission bridge. Re-run typecheck and a clean Android bundle/build after the dependency/config decision.

**Confidence:** High; confirmed by manifests, package listing, and typecheck output.

### 3. Medium — Permission errors can escape the UI's error handling

**Evidence:** `components/VoiceButton.tsx:21` awaits `requestMicPermission()` before entering the `try` at `:27`; the catch at `:31-33` only covers `Linking.openURL`. The helper awaits `ExpoAV.Audio.requestPermissionsAsync()` at `lib/native/voice-input.ts:16-19` without catching rejection.

**Impact:** If the permission module rejects (for example, native-module/configuration failure), the press handler rejects without the button's explanatory alert or a recovery path. A normal denied status is surfaced, but an exceptional permission failure is not.

**Suggested fix:** Put permission acquisition and launch under one handled error boundary; distinguish denial, permanent denial/settings remediation, and unexpected module errors. Keep a usable typed-input fallback.

**Confidence:** High from control flow; actual rejection behavior was not device-tested.

### 4. Medium — Android speech recognition is not guaranteed to be offline, with no in-flow disclosure

**Evidence:** `BeginoraVoiceActivity.kt:54-60` sends `RecognizerIntent.ACTION_RECOGNIZE_SPEECH` with language/model/prompt/result-count extras, but does not request or verify offline recognition. No app-owned speech-recognition engine or provider selection is present in the reviewed voice path. `app.json:37-38` contains microphone/speech usage descriptions for iOS, but these do not document the Android recognition provider's processing.

**Impact:** The selected Android recognition provider/service may use network processing; the repository does not establish whether audio stays on-device, is transmitted, or is retained. That uncertainty matters for potentially sensitive task descriptions in an offline-first planning aid. This is a risk, not evidence that any specific provider sent or stored audio.

**Suggested fix:** Explicitly disclose that system speech recognition may be provider/network-dependent before capture, document provider/data handling, and offer a clearly labeled on-device/offline mode if supported. Do not claim offline voice behavior without verifying the selected provider/device configuration.

**Confidence:** High that offline behavior is not guaranteed by this code; low/unknown as to actual provider transmission or retention.

### 5. Medium — Voice entry paths have different permission, feedback, and error ownership

**Evidence:** `VoiceButton.tsx:21-35` uses a JS permission helper and an alert on returned denial; `BeginoraVoiceActivity.kt:25-50` separately owns a native permission request and uses a Toast on denial; `FloatingBubble.tsx:80-83` bypasses the JS helper and suppresses link errors; the widget explicitly launches the native Activity (`BeginoraWidgetProvider.kt:52-59`). The helper comments also describe a “NativeModule bridge”/`expo-speech-recognition` or Linking fallback (`voice-input.ts:1-4,22-26`), but its implementation only requests an `expo-av` microphone permission (`:15-40`).

**Impact:** Different entry surfaces can provide inconsistent denial/failure feedback and are liable to drift in permission and recognition behavior. The UI service API name/comments suggest recognition/availability behavior that it does not implement.

**Suggested fix:** Choose one permission/recognition owner and route every voice entry surface through it; align comments and types with actual behavior. Ensure the common flow reports unsupported recognizer, denial, cancellation, and launch failure consistently.

**Confidence:** High for the distinct static call paths; runtime UX unverified.

### 6. Low — Listening state ends when URL dispatch returns, not when speech recognition ends

**Evidence:** `VoiceButton.tsx:26-35` sets `listening=true`, awaits `Linking.openURL`, and resets it in `finally`. The native speech session/result is a separate Activity callback (`BeginoraVoiceActivity.kt:54-86`) and there is no event/result callback to keep the button synchronized. The button labels itself “Listening…” only while the local flag is true (`VoiceButton.tsx:42-51`).

**Impact:** If the URL route is later fixed, the visual/accessibility listening state can clear immediately after launching capture rather than covering the recognition session; the local `listening` guard does not prevent interaction for that session.

**Suggested fix:** Drive the state from native start/result/cancel/error events, or remove the listening claim and use a status indicator that accurately reflects launch state.

**Confidence:** High from local state/control flow; timing not device-tested.

### 7. Low — Task-creation screen has no voice affordance and voice transcripts route only to chat

**Evidence:** `app/task/new.tsx:65-90` renders only title and context `TextInput`s. The native result constructs a `chat?voice_text=` URL (`BeginoraVoiceActivity.kt:77-80`), and `app/index.tsx:125-133` only pre-fills the chat input.

**Impact:** Users starting from the dedicated “What feels hard to start?” task-creation screen cannot dictate the title/context through that screen. If voice is intended to support task entry throughout the app, it is only partially integrated.

**Suggested fix:** If voice entry is in scope for new-task creation, add a task-form-specific affordance and return-to-form parameters/handler; otherwise clarify that voice input is chat-only.

**Confidence:** High for current UI/path; whether task-form voice is a product requirement is not established.

## What appears sound in source (not runtime-verified)

- Android `RECORD_AUDIO` is explicitly listed in `app.json:17-28` (`:25`), and the configured custom plugin is included at `app.json:69-70`.
- The custom plugin copies Android native source/resources and adds the voice Activity manifest entry (`plugins/with-system-actions.js:30-86,188-201`). This verifies intended prebuild wiring in source, not successful generated native output/build.
- The native Activity handles a grant/deny result and catches failure to launch the recognition intent (`BeginoraVoiceActivity.kt:22-67`). It handles a successful result by encoding the transcript into a `chat?voice_text=` URL (`:69-86`).
- The app deep-link handler accepts chat URLs, limits transcript prefill to 1,000 characters, and places it in the editable chat draft rather than automatically sending (`app/index.tsx:120-139`; `components/ChatInput.tsx:28-42`).
- iOS is explicitly unsupported in the voice helper (`lib/native/voice-input.ts:16-18,32-35`) and UI (`components/VoiceButton.tsx:17-20`); the iOS microphone/speech usage strings in `app.json:30-40` do not add an iOS recognition implementation.

## Test and verification gaps

- No tracked voice/audio test file was found. Existing Jest test paths cover other native services but not `VoiceButton`, `voice-input`, speech recognition, audio permission, voice-result deep links, or task-form voice.
- No Android/iOS build, prebuild-generated manifest inspection, emulator/device permission prompt, system recognizer availability, cancellation, offline-provider behavior, cold-start/warm-start return, or end-to-end UI run was performed.
- The only executed check was `npm run typecheck -- --pretty false`; it failed for the missing `expo-av` and `@expo/vector-icons` modules and an unrelated `lib/ai/decomposer.ts` type error. No Jest suite was run.
- Recommended minimum tests: permission granted/denied/rejected; recognizer unavailable/cancelled/result; `beginora://voice` dispatch reaches native capture; transcript deep link prefills without auto-send on both initial and live URL delivery; repeated presses/listening state; Android widget and floating-bubble paths; and explicit iOS unsupported fallback.
