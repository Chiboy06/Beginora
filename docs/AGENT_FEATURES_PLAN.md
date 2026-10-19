# Agent features plan: background agent, screen-pattern signals, two-way Telegram

Prepared 19 October 2026 for the UnivaBio deadline (21 October 2026, 04:45 GMT+1). The owner keeps all three features in scope. Every claim below is marked **Verified** (checked in this repository or in primary documentation, cited), **Tested** (a test ran and its result is recorded), or **Unverified** (must be confirmed on a phone). Nothing is assumed.

## 0. The stuck screen on the owner's phone

**Report.** The owner installed and signed the APK and downloaded two models. The app does not respond, and it stays on the same screen after being closed and reopened.

**Cause found in code (Verified).** On every launch, `lib/store/chat-store.ts` automatically reloads the last selected model (`restoreSelectedModel`). Nothing remembered whether the previous load finished. If loading crashes the app (for example out of memory with a 4B or 8B model on a 3 to 4 GB phone) or hangs, the next launch tries the identical load again, so the app is trapped. The Models screen shows a RAM fit label but does not stop an oversized model (`app/models.tsx`). Possible triggers at launch:

- low free memory;
- a damaged saved prefix-cache file, which `warmSessionCache` reloads each launch;
- a performance setting changed in Settings.

**Fix (Tested).** Before the startup load, the app now stores a marker (`prefs.pendingModelLoad`) and clears it when the load finishes. If the marker is still set on the next launch, the previous load never finished. The app then:

- skips the automatic load;
- deletes the saved prefix cache;
- shows "Couldn't load <model>, open Models to retry".

Two unit tests in `lib/store/__tests__/chat-store-startup.test.ts` cover it. The "not retried" test was run against the old code and **failed**, and **passes** with the fix, so the test proves the fix.

**Still Unverified.** Which screen the phone shows, and whether this is the cause there. Needed from the owner:

- the exact text on the stuck screen;
- the phone model and RAM;
- which two models were downloaded.

The fix reaches the phone only in a new APK. On the currently installed APK, Android's "Clear cache" does not help, because models and the prefix cache live in app storage (`documentDirectory`). "Clear storage" does help, but it deletes tasks and downloaded models.

## 1. Facts this plan rests on

| Fact | Status | Source |
| --- | --- | --- |
| `expo-background-task` uses WorkManager on Android, minimum interval 15 minutes, inexact timing; if the user kills the app, tasks stop until it is reopened; swiping from recents varies by vendor | Verified | [Expo BackgroundTask docs (SDK 58)](https://docs.expo.dev/versions/latest/sdk/background-task/) |
| Open bug: re-registration on a headless restart can cancel the running worker | Verified (bug report, not docs) | [expo/expo#51246](https://github.com/expo/expo/issues/51246) |
| `specialUse` foreground service needs `FOREGROUND_SERVICE_SPECIAL_USE`, a `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` property, and a Play Console App content declaration; no time limit is stated | Verified | [Android foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) |
| Android 15 blocks starting `dataSync`, `mediaPlayback`, `mediaProjection`, `phoneCall` (and camera/microphone) services from `BOOT_COMPLETED`; `specialUse` is not listed | Verified | same page |
| A service can be started from the background after a notification action, a widget tap, `BOOT_COMPLETED`, or when battery optimisation is off for the app | Verified | [FGS background-start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) |
| Usage data needs `PACKAGE_USAGE_STATS`, granted by the user in Settings (Usage access); declaring it in the manifest is not enough | Verified | [Google AppUsageStatistics sample](https://github.com/googlesamples/android-AppUsageStatistics/blob/master/README.md) |
| Play's declaration-form list (visible part) names QUERY_ALL_PACKAGES, SMS/Call Log, accessibility, background location and others, but not usage access | Verified for the visible page; the page was truncated | [Play permissions policy](https://support.google.com/googleplay/android-developer/answer/9888170) |
| `ACTIVITY_RESUMED` / `ACTIVITY_PAUSED` events identify the foreground app; history retention length and availability before first unlock | Unverified, test on device | Android reference (not fully read) |
| Telegram `getUpdates`: `timeout` enables long polling; the offset must be one more than the last update ID to confirm it; it fails with 409 while a webhook is set | Verified | [Telegram Bot API](https://core.telegram.org/bots/api) |
| `BeginoraService` is a `specialUse` foreground service returning `START_STICKY`; Kotlin files in `native/android/` are copied into the build by `plugins/with-system-actions.js` | Verified in repo | `native/android/.../BeginoraService.kt`, plugin lines 32 to 55 |
| Telegram config already stores `botToken` (secure storage) and `chatId` | Verified in repo | `lib/telegram/telegram-service.ts` |

## 2. Design

**Principle.** Cheap, deterministic detection runs in the background. The language model runs only when the user is present, or while the user has switched on the always-on service, because loading a multi-gigabyte model inside a 15-minute WorkManager slot is unreliable.

### 2.1 Background agent

1. **Periodic scan** with `expo-background-task`: every 15 minutes or more, for all open tasks.
   - Reuse the scoring in `lib/focus/detection-engine.ts`.
   - Add the screen-pattern signal from 2.2 when Usage access is granted.
   - Also scan once whenever the app returns to the foreground. That path works even when WorkManager is delayed.
2. **Nudge**: one local notification through the existing `expo-notifications` path.
   - At most one per task per day, with quiet hours 22:00 to 08:00 by default.
   - The copy follows section 6.1 of the build document.
   - Tapping it opens `/task/[id]`, using the existing handler in `app/_layout.tsx`.
3. **Always-on mode** (opt-in, existing `BeginoraService`): keeps the model loaded and hosts Telegram polling.
   - It must be started from the app or a notification action (an allowed background start).
   - After a reboot it may restart from `BOOT_COMPLETED`, which is allowed for `specialUse`.
4. **Settings**:
   - a "Gentle check-ins" switch, off by default; notification permission is requested only when it is turned on;
   - a battery-optimisation guide for Tecno, Infinix, Xiaomi and Samsung.

### 2.2 Screen-pattern signals

1. **Native code**: three methods in the existing `SystemActionsModule.kt`:
   - `hasUsageAccess()`;
   - `openUsageAccessSettings()`;
   - `getAppEvents(sinceMs)`, which returns only package name, event type and time.

   Add `PACKAGE_USAGE_STATS` to the manifest.
2. **Signals as pure TypeScript functions**, unit-tested with recorded event fixtures:
   - app switches per 10 minutes while a task is pending;
   - minutes spent in apps the user marked as distracting;
   - late-night drift (continuous phone use after quiet-hours start).
3. These feed a new `drift` signal in the detection engine; paralysis (avoiding the task) and hyperfocus already exist.
4. **Privacy**:
   - Raw events are read on demand and kept in memory only; they are never written to the database or sent anywhere.
   - Only derived counts are used.
   - The consent screen explains this before opening Settings, and an off switch lives in Settings.
5. **Never use**: accessibility services, screen capture, notification listeners or message reading.

### 2.3 Two-way Telegram

1. **Polling.** While always-on mode is enabled, loop `getUpdates` with `timeout=50`.
   - Persist the offset after each batch.
   - Call `deleteWebhook` once on enable (otherwise 409).
   - Back off exponentially on network errors.
2. **Security.** Accept messages only from the saved `chatId`. Ignore everyone else silently, because anyone can find a bot.
3. **Commands**:
   - `/next`: next first step of the most recent open task;
   - `/add <task>`: create a task and plan it;
   - `/stuck`: a smaller first step for the current task;
   - `/done`: record the outcome;
   - free text: sent to the agent.
4. **Tool limits over Telegram.** Planning and task tools only. Calls, SMS, email, calendar reads and contacts are refused over Telegram and must be done in the app. This keeps device actions behind in-app confirmation.
5. **Model.** If no model is loaded, the rule engine answers, so replies still work on low-end phones.
6. **Disclosure.** Bot messages pass through Telegram's servers and are not end-to-end encrypted. The Settings text must say so.

## 3. Test plan (what "tested" means for each feature)

| Feature | Layer 1: unit (Jest, every commit) | Layer 2: real system on this PC | Layer 3: phone |
| --- | --- | --- | --- |
| Startup crash-loop guard | Done: 3 tests, back-tested against the old code | n/a | Select the 8B model on a 4 GB phone, relaunch twice: the second launch shows the notice and the app is usable |
| Background scan and nudges | Scan picks the right task; rate limit; quiet hours across midnight; no nudge when check-ins are off | n/a (WorkManager is Android-only) | Debug build: `triggerTaskWorkerForTestingAsync`; release build: create a task, snooze it 3 times, close the app, wait 30 minutes with screen off, nudge arrives; repeat on two brands |
| Screen-pattern signals | Signal functions on recorded event fixtures: no events, rapid switching, a long session in a distracting app, events spanning midnight | n/a | Grant with `adb shell appops set app.beginora.android GET_USAGE_STATS allow`, then deny and revoke; confirm Settings state and no crash |
| Two-way Telegram | Offset handling; allowlist rejects other chats; 409 triggers `deleteWebhook`; backoff; refused tools | **Real bot**: `scripts/telegram-smoke.js` runs the same polling module in Node against a real test bot token: send `/next`, `/add`, a message from a second account (must be ignored) | Always-on mode on, screen off 30 minutes, send `/next`, reply arrives; reboot, service restarts, reply arrives |
| Real model | Existing mocked tests stay | R1 eval against the Qwen3 1.7B GGUF ([PRODUCT_PLAN.md](PRODUCT_PLAN.md) section 2) | R2 self-test in Diagnostics, in airplane mode |

Release gate for the submission build: all Layer 1 tests pass, the Telegram real-bot smoke test passes, and at least the crash-loop guard, one nudge and one Telegram reply are observed on the owner's phone and shown in the demo video.

## 4. Build order for the deadline

Ordered so that each step is testable before the next, and the parts testable without a phone come first.

| Order | Work | Test before moving on |
| --- | --- | --- |
| 1 | Crash-loop guard | Done and back-tested |
| 2 | Two-way Telegram polling module (pure TypeScript, injectable `fetch`) | Unit tests, then the real-bot smoke test from this PC |
| 3 | Background scan and nudge rules (pure TypeScript) | Unit tests |
| 4 | Screen-pattern signal functions (pure TypeScript) | Fixture unit tests |
| 5 | Wire to the platform: `expo-background-task`, Usage access native methods, Telegram loop started by `BeginoraService`, Settings switches | Type check, lint, all tests, `expo-doctor`, `expo prebuild` |
| 6 | New APK (version 0.2.7, versionCode 9) | Phone Layer 3 checks above |
| 7 | Demo video, one-page PDF, code PDF | Only features observed on the phone appear in the video |

Every change in this plan, including the crash-loop guard, reaches the phone only through a newly built APK. This machine has no Android SDK, so step 6 needs Android Studio, a cloud build, or the machine used for earlier builds.

## 5. Risks

| Risk | Status | Mitigation |
| --- | --- | --- |
| Phone brands stop WorkManager or the service | Known, varies by vendor | Foreground-return scan as a fallback; battery guide; test on two brands |
| Phone and PC both polling the same bot | getUpdates confirms updates by offset; duplicate pollers would split messages | Only one poller runs: the PC smoke test uses a separate test bot |
| Usage access looks invasive to judges or users | Design choice | Opt-in, derived counts only, nothing stored or sent, explained before asking |
| Play review of `specialUse` and usage access | Declaration required for `specialUse` (Verified) | Not needed for the hackathon APK; file declarations before any store release |
| Model too large for the phone | Fix in place for the crash loop | Next: block activating a model whose `minRamMb` exceeds device RAM, with an override |
