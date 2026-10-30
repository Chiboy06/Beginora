# Changelog

All notable changes to Beginora are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.18] — Voice that feels like a conversation

### Changed
- **Listening happens inside Beginora.**
  - No Google pop-up each turn.
  - Your words appear while you speak, both in the chat box (microphone button) and on the hands-free voice panel.
  - On-device recognition is tried first (local first). If the phone has no offline language pack, the phone's normal recognizer is used.
  - Phones without in-app recognition still get the old pop-up.
- **It doesn't cut you off.**
  - It waits about 1.5 s of silence before deciding you've finished.
  - If you trail off on "and…", "by…", "so…" or a comma, it keeps listening and joins the parts into one message.
- **It talks while it thinks.** Each sentence of the reply is spoken as soon as it is written, instead of after the whole answer.
- **A voice panel in Talk.**
  - An orb that grows with your voice, your words as you speak, and Listening / Thinking / Talking.
  - Tap the orb to finish speaking, or to interrupt Beginora and talk.
  - The orb stays still if the phone asks for reduced motion.
- **Silence ends gently:** "I'll stop listening for now. Tap to talk again."
- **Build review (30 October):**
  - **Dependencies:** 17 packages were a few patch versions behind Expo SDK 58 and are now aligned, including `expo` 58.0.21, `expo-router` 58.0.28, `expo-notifications` 58.1.7 and `react-native` 0.88.1. `expo install --check` reports up to date.
  - **Security:** `node-forge` moved to 1.4.2 (fixed advisory). The unused `drizzle-orm` / `drizzle-kit` layer (`lib/db`, never imported) was removed, which cleared the 4 moderate findings. The only remaining high finding is zod inside Expo's build-time CLI; its only fix is a major version Expo does not support yet. It is approved by exact advisory ID in `scripts/check-audit-policy.js`, with the reason. `npm run audit:ci` passes.
  - **Lint:** from 33 errors to 0. Fixed refs read or written during render (voice orb, hands-free hook), `Date.now()` during render, extra renders from state set in effects (step timer, Telegram status), a missing effect dependency (Focus), unused and duplicate imports, and import order. The lint config now skips `relay/` and `supabase/` (other runtimes), knows `scripts/` are Node, and turns off two rules that do not apply to React Native, each with its reason.
  - **Verified:** type check, 700 Jest tests, 17 relay tests (SQLite and Postgres), real-model eval 21/23 (the 2 misses are Qwen3 0.6B facts), a full Android Metro bundle (8.5 MB Hermes bytecode), and `expo prebuild` (speech service query, microphone permission, version 20).
- **New dependency:** `expo-speech-recognition` 58.0.1. It is a native module, so **a new APK build is required**; an over-the-air update cannot add it.
- Android `versionCode` 20 / version 0.2.18.

---

## [0.2.17] — A whole day's plan in one sentence

### Fixed
- A message with several times becomes a schedule. For example: "read by 5, by 6 I'll go jogging, by 7 dinner, by 8 light gaming, by 9 movies, by 11 sleeping".
  - Each item gets its own time; times without am/pm are read in order (5 pm to 11 pm).
  - The list is read back; after a yes, each item becomes a task with a reminder on its day in Plan.
  - Works the same typed or spoken.
  - "Tomorrow" applies to the whole plan, and one item with two times ("medicine at 8am and 8pm") becomes two.

### Changed
- Android `versionCode` 19 / version 0.2.17.

---

## [0.2.16] — Talk to it: follow-up questions by voice or text

### Added
- **Follow-up questions.** These work the same typed, with the microphone, or in hands-free voice, and run in code, so they work with any model or none.
  - **Tasks.** "Set me a task" asks: What's the task? When? Remind you? Any details? Then it saves the task with a first small step. Saying the title and time at once ("add a task to call mum on Friday at 9am") skips the questions already answered. "No time" puts it in Sort later.
  - **Lists.** "Add tasks: buy bread, call mum and pay rent on Friday" reads the list back ("I heard 3 tasks") and adds them after a yes.
  - **Reminders.** "Set me a reminder" asks what and when.
- **Moods by voice.** "I'm feeling happy today", "I feel so tired", "my day was good" (or "not good") save today's mood to the journal and ask how your day went.
- **Daily "How was your day?" check-in.**
  - After the first mood, Beginora asks when to ask you each day, and sets it.
  - You can also say "ask me how my day was at 8 pm", or "stop asking about my day".
  - It can be turned on and off, with a time, in Journal.
  - The notification opens a new journal entry.
- **Open any page by voice or text.** For example "open my journal", "show me the plan", "go to routines", "open my goals", "plan my week", "reset my day", "start a focus session", "bring up my memories", "open Telegram".

### Fixed
- Phrasings that silently failed before now work: "set me a task", "create a task", and "add tasks" (plural).
- A task saved from chat with a time ("by 6pm") now also gets that due time, so it shows on its day in Plan.
- An unanswered question never traps the conversation:
  - a clear new request drops it;
  - a missed answer is asked once more, then the words are handled normally;
  - "cancel" stops it.

### Changed
- Android `versionCode` 18 / version 0.2.16.

---

## [0.2.15] — Local first, Liquid Glass tab bar, theme switch that works

### Changed
- **Local first everywhere.** The phone's own model is tried before the online model:
  - **Chat in "When needed" mode:** goes online only when no phone model is loaded (before, it also went online whenever a small model was loaded). If the phone model fails on a question, the online model answers instead of showing an error.
  - **Plan my week and Summarise my goals:** use the phone model (1.5B or more) first, then the online model, then the no-AI splitter. Before, they tried online first.
  - **"Always for questions"** stays as an explicit choice in Settings > Online model.
- **Liquid Glass tab bar.** It floats over the screens with a translucent fill and a light edge, so content shows through it. iOS adds a live blur; Android uses a translucent fill. Today, Plan, Talk and Settings leave room for it, and the + buttons and the chat box sit above it.
- **Dark and light mode apply at once.** Choosing Light, Dark or Follow phone offers "Restart now", and Beginora restarts in a second with your data kept. Glass cards now use a dark blur in dark mode.
- Android `versionCode` 17 / version 0.2.15.

---

## [0.2.14] — Plan your week with Beginora, step by step

Follows the four steps of "Plan your week": talk instead of typing, a task manager, tell it your goals, and a weekly routine.

### Added
- **Summarise my goals**: talk freely, then Beginora tidies it into Goals, Projects and How I work, and finds your projects. You choose "Use this summary" or "Keep my words". Needs the online model or a phone model of 1.5B or more.
- **Planning guide**: the weekly-planning instructions are saved after your goals and used every week. You can edit them, or reset to the default.
- **Goals as a memory**: saving your goals also stores them as one memory, so Talk knows them when you ask about yourself. Saving again replaces it.
- **The weekly-plan routine**: pick the day (Monday by default) and the time. Its only instruction is to ask "What's your plan for the week? Let's check it against your goals." and wait for your draft.
- **Send to another task app**: share the approved plan, grouped by project, to Todoist, Google Tasks, Linear or any app on the phone. Beginora's own tasks stay the main task manager.

### Fixed
- Model answers with real line breaks inside JSON strings are now read instead of rejected.

### Changed
- Android `versionCode` 16 / version 0.2.14.

---

## [0.2.13] — Plan my week, checked against your goals

### Added
- **My goals**: write or speak your yearly or quarterly goals and how you work, and keep a list of projects. Everything stays on the phone.
- **Plan my week**:
  - Talk through a rough plan; it is checked against your goals.
  - Up to 3 off-goal items are flagged kindly, each with "Remove from plan" or "Keep it".
  - The plan becomes editable rows of project, task and due date. Due dates are added only when you name a day.
  - Open tasks from last week are listed separately: Keep, Already done, or Let go (deleting asks first).
  - "Create N tasks" adds them all at once.
  - A new project or goal change is suggested, and saved only if you tap "Save to my goals".
- **Monday check-in** (optional): a weekly notification at the hour you choose, "What's your plan for the week? Let's check it against your goals." It opens Plan my week. It is scheduled on the phone, so it needs no computer or internet.
- **Projects on tasks**: shown in Plan, filterable in the list view, and editable on the Edit screen.
- Saying "plan my week" in Talk points you to the screen.

### Model choice for the goal check
- The online model is used if set up, otherwise a phone model of 1.5B or more.
- Otherwise (or for Qwen3 0.6B) the plan is split into tasks from your words, without the goal check.
- In testing, Qwen3 0.6B dropped 3 of 5 items, so models under 1.5B are skipped for this.
- If any model returns far fewer tasks than you said, its goal flags are kept but every task from your words is used.

### Changed
- Android `versionCode` 15 / version 0.2.13.

---

## [0.2.12] — Planner, routines, journal, online model, shared Telegram bot

### Added
- **Today** (new home tab):
  - greeting with your name;
  - "Up next" (the next reminder or timed task);
  - your first step with "Start 10 minutes";
  - up to three tasks;
  - "How is your day?";
  - tools (Routines, Focus, Talk, Reset my day);
  - a "Welcome back" card after 3+ days away;
  - a Capture button.
- **Capture**: type or say it ("call the dentist tomorrow at 9"). A time becomes a reminder; a day without a time offers 9:00, 13:00 or 18:00; no time goes to "Sort later".
- **Plan** tab (replaces Tasks):
  - week strip and month calendar with dots on busy days;
  - the selected day's tasks and reminders, each cancellable;
  - a "Sort later" inbox;
  - a list view with filters;
  - a visible "…" menu on every task (Edit, Move to tomorrow, Delete).
- **Tasks**:
  - day, time, repeat (every day, weekdays, every week), notes, editable subtasks and a reminder at the task's time;
  - a repeating task moves to its next time when done;
  - new Edit screen; task details show when and repeat.
- **Focus**: choose 5, 10, 15 or 25 minutes; free focus without a task; at the end, a break, another round or finish.
- **Routines**: a library of 7 ready-made routines, plus your own (one step per line). Run them one step per page, with a clock-based timer, "Make it smaller" and Skip, and an optional mood at the end.
- **Mood and journal**:
  - 8 moods, each with a word;
  - title and "How did it go?";
  - "What helped" chips plus your own;
  - a week strip showing each day's mood, and a weekly summary (no scores).
- **Reset my day**: what matters today, pick one of three things, or clear old items (Done, Tomorrow or Let go, each confirmed).
- **Online model (optional)**:
  - your own API key for any OpenAI-compatible service (OpenRouter, Groq, OpenAI, Gemini, or LM Studio/Ollama on your network);
  - modes: Off, When needed (no model or a model under 1.5B), or Always for questions;
  - the key is kept in secure storage; https only (plain http allowed only on the home network);
  - memories are not sent unless allowed;
  - if the online model fails, the phone model answers;
  - replies are labelled "Online · model";
  - alarms, reminders, texts and tasks never go online.
- **Shared Telegram bot**:
  - connect in one tap, with no bot token, through a relay (Cloudflare Worker + D1);
  - relay code in `relay/`, tested against real SQLite (`npm run test:relay`);
  - set-up guide in `docs/TELEGRAM_RELAY_GUIDE.md`;
  - two-way replies work through the relay too;
  - "Use my own bot" is still available.
  - The relay also runs on **Supabase** (Edge Function + Postgres, `supabase/functions/telegram-relay`). The relay tests run on both SQLite and Postgres (PGlite).
- **Settings**:
  - Appearance: follow phone, Light or Dark (dark palette checked at 4.5:1 or better);
  - Notifications: hide reminder text on the lock screen, and your own quiet hours for check-ins;
  - links to Routines, Journal, Online model and Telegram.

### Changed
- A finished repeating task still counts in "done today" after moving to its next date.
- The chat moved to the **Talk** tab. `beginora://chat` links open it.
- Hard-coded light colours were replaced by theme tokens, so screens work in dark mode.
- Android `versionCode` 14 / version 0.2.12.

---

## [0.2.11] — Small models stop repeating themselves

### Fixed
- Questions no longer get an earlier date answer back. Replies written by the app (dates, greetings) are left out of what the model sees; Qwen3 0.6B answered "How many states are in Nigeria?" with "Tomorrow is Wednesday".
- Memories are added to the prompt only when a question is about you ("my…", "remember…", "what do you know about me"). Before, the model recited them in unrelated answers.
- Models under 1.5B no longer save memories, and a "memory" that copies Beginora's own instructions is rejected.
- Chat replies use the Qwen3 model card's non-thinking settings (temperature 0.7, top_p 0.8, top_k 20, presence penalty 1.0) instead of near-greedy decoding, which loops. A reply is cut at its first repeated sentence and plain prose keeps at most 4 sentences.

### Added
- Settings > Memory: see what Beginora remembers and delete any of it.
- Qwen3 0.6B is labelled "Quick helper: can be wrong on facts"; Qwen3 1.7B is recommended on phones with 6 GB RAM or more.

### Known limit
- Qwen3 0.6B still gets facts wrong (real-model eval: 19/22; it says Nigeria has 18 states, the answer is 36 plus the FCT). Use Qwen3 1.7B or larger for factual questions.

### Changed
- Android `versionCode` 13 / version 0.2.11.

---

## [0.2.10] — Reminders with sound, faster answers

### Changed
- Android `versionCode` 12 / version 0.2.10, so it installs over the 0.2.9 (build 11) test APK.

---

## [0.2.9] — Hands-free voice fix

### Fixed
- `lib/voice/use-hands-free.ts` — the speech recognizer opens its own screen, which React Native reports as the app going to the background; hands-free mode stopped itself on the first listen and dropped what was said. App-state changes are now ignored while the recognizer is open.

- Small on-device models (verified against a real qwen3:0.6b with `evals/`): clear action requests now list only their tool; calendar questions read the real calendar; relative times ("in 1 hour") come from the clock; dates, alarm times and event titles are repaired and validated before you are asked to confirm; confirmation text is written by the app; notes keep your words; greetings, thanks, feelings and "what can you do" are answered instantly without the model; a reply identical to the previous one is regenerated. Result: 10/10 action cases with valid details and a varied 5-turn conversation, up from 7/10 with invalid times and a looping chat.

- Common actions are filled from your words without the model (alarms, timers, reminders, texts, tasks, screen time): 2 to 9 ms instead of seconds, identical on any model. Chat works with no model loaded. Questions get a short prompt and short answers (capital of Nigeria: Abuja in 3 s on qwen3:0.6b).
- Downloads pause with a resume point when the connection drops; Models shows Resume.
- The keyboard no longer covers text fields (Android edge-to-edge).
- Hands-free greets once per session and stops talking when you tap.
- Reminders ring on time with sound and vibration (new "Reminders" alert channel, `alarmClock` delivery, `SCHEDULE_EXACT_ALARM`); before, they arrived silently and could be late.
- Date and time questions are answered from the phone clock, and the hidden time tag is only added to messages about times, so small models stop answering "today" to unrelated questions.
- Faster answers: questions send only the last 6 messages, and the startup cache warms the exact question prompt (it previously warmed an unused prompt).
- A repeated answer is retried once; if it repeats again, Beginora says it isn't sure instead of repeating a likely-wrong fact.
- "Type / write / draft an SMS for Daniel" opens a text to Daniel (message filled in when given, scheduled when a time is given).
- Models warns about reasoning models (DeepSeek-R1 distills, QwQ): slow, wordy replies on a phone.
- Long chat titles no longer run under the header buttons.

### Added
- Qwen3 0.6B (397 MB) in the catalog as the fastest model.
- "Add a task to … by 6pm" saves the task with a reminder; "how much screen time today?" lists your top apps.
- Tasks screen lists upcoming reminders (with Cancel) and recent past ones; Permissions has "Allow on-time reminders".
- Real-model evaluation (`evals/__tests__/real-model.test.ts`, run with `REAL_MODEL=qwen3:0.6b`): the app's own orchestrator against a model served by Ollama.
- Design: a soft sage-to-stone gradient backdrop and a floating, rounded tab bar with filled/outlined vector icons; the bar hides while typing.
- Voice navigation in hands-free mode: "open settings", "show my tasks", "go to the calendar", "open permissions", "open models", "open history", "open documents", "open new task" and "go back", matched without the model.

### Changed
- Android `versionCode` 11 / version 0.2.9.

---

## [0.2.8] — Responsiveness and first-step fixes

### Fixed
- `components/FloatingBubble.tsx` — the active-task bubble was a React Native `Modal`, which on Android is its own window and captures every touch; while a task was active the whole app ignored taps, including the tab bar. It is now a plain overlay that lets touches through.
- `lib/orchestrator/tool-dispatcher.ts`, `orchestrator.ts` — `break_down_task` did nothing and the user only saw the model's one-line "confirmation", often a question back. It now runs the planner (safety pre-check, validated output, rule-engine fallback) and shows the first step and next steps.
- `lib/store/token-batcher.ts` — streamed tokens updated the chat screen once per token (10 to 20 times a second), starving the JS thread; updates are now batched every 80 ms.

- Device calendar and contacts: in Expo SDK 58 their root-import functions are stubs that throw, so the calendar showed "unavailable" and contact lookups for calls and texts failed. Imports now use `expo-calendar/legacy` and `expo-contacts/legacy`.
- Chat replies and task plans now run with Qwen3 thinking off, and the planner finds the JSON object past think blocks and code fences instead of silently falling back.

### Added
- Hands-free conversation (`lib/voice/`): Beginora greets you by name, listens, replies aloud with the phone's text-to-speech, and listens again; "yes"/"no" answers pending actions and "stop" ends it.
- A personal welcome: each launch opens a fresh chat with a time-of-day greeting; Beginora asks for your name once (also editable in Settings > About you) and uses it in conversation.
- Permissions screen: one-tap Allow for calendar, contacts, microphone and notifications, Open settings when Android won't ask again, and shortcuts for usage access and battery.
- New chat tools: `schedule_sms` (a notification at the chosen time opens the ready-written text), `save_note` (share sheet to any notes app), `draft_email`, `send_telegram`.
- Example chips for alarms, reminders, texts and notes on the empty chat screen.
- Settings > Telegram: "Find my chat ID" fills the chat ID after you message your bot.

### Changed
- Android `versionCode` 10 / version 0.2.8 (the installed test build was 0.2.7 / 9).

---

## [0.2.6] — Onboarding route fix build

### Added
- Gentle check-ins (opt-in): background scan with expo-background-task; one calm notification per task per day at most; quiet hours 22:00 to 08:00 (`lib/focus/check-ins.ts`, `check-in-runner.ts`, `background-check-ins.ts`)
- Phone-use pattern signals (opt-in) through Android Usage access: new `SystemActionsModule` methods and `lib/focus/usage-signals.ts`; `PACKAGE_USAGE_STATS` added by the config plugin
- Two-way Telegram bot (opt-in): `/add`, `/next`, `/stuck`, `/done` and free text; owner chat only; no device actions from Telegram (`lib/telegram/telegram-bot.ts`, `telegram-commands.ts`, `telegram-runner.ts`)
- Settings: Assistant section and a Telegram reply switch
- Submission documents in `docs/submission/` and `scripts/build-submission-docs.mjs`; real-bot test `scripts/telegram-smoke.mts`

### Fixed
- `app/_layout.tsx` — root always mounts the Stack and gates onboarding/app routes with `Stack.Protected` (PR #5), fixing the fresh-install startup loop
- `lib/storage/database.ts` — `deleteConversation` now deletes messages and the conversation in one transaction
- `scripts/check-audit-policy.js` — audit gate now runs on Windows (`npm.cmd` needs a shell)
- `lib/storage/database.ts` — `getMessages` returned the *oldest* 50 messages, so reopening a conversation longer than 50 messages hid the newest ones; it now returns the newest 50 in chronological order
- `app/models.tsx` — a model download interrupted by the app being killed no longer sits in an unlabeled limbo state; it is labeled as unfinished with delete/re-download guidance

- `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx` — the chat screen opened outside the tab navigator with its header hidden (a PR #5 regression), so there was no way to leave it; `/` and `/settings` now resolve only to the tabs, guarded by a route-uniqueness test
- `lib/orchestrator/orchestrator.ts` — long chats overflowed the 4096-token window (20 history messages plus a 4096-token reply budget), so context shifting evicted the system prompt and replies degraded into rambling; history is now trimmed to fit and replies are capped at 1024 tokens
- `lib/store/chat-store.ts` — a model load that crashed or hung at startup was retried on every launch; it is now skipped after one failed attempt

### Accessibility (Apple HIG foundations: 4.5:1 text contrast, 44pt targets, 11pt minimum type)
- `lib/theme.ts` — text colors raised to pass 4.5:1: muted text `#8E8E93` 3.3:1 → `#6C6C70` 5.2:1 (45 uses), success 2.2:1 → 5.4:1, warning 2.7:1 → 5.6:1, placeholder 1.7:1 → 4.7:1; sage accent nudged `#4A7A6A` → `#467565` so regular-weight accent text passes on every surface
- `components/FloatingBubble.tsx` — Open/Close controls raised to 44pt; 10pt label raised to the 11pt minimum
- Screen readers: button roles on 16 unlabeled controls (Models, Documents, History, Diagnostics), a label for History's "+" button, a hint for long-press delete, and expanded state on the reasoning toggle

### Changed
- Upgraded React Native from release candidate `0.88.0-rc.4` to stable `0.88.0` and aligned 17 Expo SDK 58 packages to their expected patch versions (Expo Doctor 20/20)
- Android `versionCode` 8 / version 0.2.6. The onboarding-fix APK had been rebuilt as 0.2.5 / 7, the same identity as a different earlier APK; every distributed build needs a unique, increasing version code

---

## [Unreleased]

### Added
- `lib/sync/sync-service.ts` — background runner that drains the sync queue; feature-flagged off until a real backend exists
- `app/onboarding.tsx` — first-run disclaimer screen; `app/_layout.tsx` gates on `prefs.onboardingDone` and redirects new users before the tab navigator loads
- `lib/ai/decomposer.ts` — deterministic safety pre-check added before any model call; crisis and medical-treatment content returns a fixed, human-reviewed response and stops (no model call)
- `docs/DECISIONS.md` — full autonomous-decision log covering D-001 through D-011 plus known risks
- `README.md` — complete, accurate project README matching actual behaviour; roadmap items clearly marked

### Changed
- `lib/ai/decomposer.ts` — `DecompositionResult.source` now includes `"safety_block"` as a possible value

---

## [0.2.0] — Native Rename & Cleanup

### Changed
- Renamed all 9 Kotlin source files from `com.cosmico.vesta` package to `app.beginora.android`
  - `VestaService.kt` → `BeginoraService.kt` — notification channel ID, action constant, and status text updated to Beginora
  - `VestaServiceModule.kt` → `BeginoraServiceModule.kt` — module name exposed to React Native changed from `VestaServiceModule` to `BeginoraServiceModule`
  - `VestaQuickChatActivity.kt` → `BeginoraQuickChatActivity.kt` — deep link scheme changed from `vesta://` to `beginora://`, accent color updated to sage green `#5C7A6B`, input hint updated to "What would you like to work on…"
  - `VestaVoiceActivity.kt` → `BeginoraVoiceActivity.kt` — deep link scheme changed to `beginora://`, voice prompt updated to "Talk to Beginora..."
  - `VestaWidgetProvider.kt` → `BeginoraWidgetProvider.kt` — layout reference updated to `beginora_widget_layout`, deep link scheme updated to `beginora://`
  - `SystemActionsModule.kt`, `SystemActionsPackage.kt`, `McpHttpServer.kt`, `McpServerModule.kt` — package declaration updated, `SystemActionsPackage` now registers `BeginoraServiceModule` instead of `VestaServiceModule`
- Android resource files renamed and updated
  - `vesta_widget_info.xml` → `beginora_widget_info.xml` — layout reference updated
  - `vesta_widget_layout.xml` → `beginora_widget_layout.xml` — icon reference updated to `ic_beginora_leaf`, header text updated to "Beginora"
  - `widget_strings.xml` — all strings updated: label "Vesta" → "Beginora", description and hint updated to Beginora copy
- `plugins/with-system-actions.js` — source directory path updated to `app/beginora/android`, all manifest entries updated to Beginora class names (`BeginoraService`, `BeginoraQuickChatActivity`, `BeginoraVoiceActivity`, `BeginoraWidgetProvider`), widget meta-data resource updated to `@xml/beginora_widget_info`, foreground service description updated

### Removed
- Empty `src/` scaffold directory (components/ui, db/migrations, features/ai, features/sync, features/tasks, hooks, lib, types) — all actual code lives under `lib/`, `app/`, and `components/`
- Old `com/cosmico/vesta/` Kotlin package directory tree

---

## [0.1.0] — Initial Beginora Build

### Foundation
- Forked from [RisorseArtificiali/vesta](https://github.com/RisorseArtificiali/vesta) — Expo SDK 55 / React Native 0.83.2 offline-first AI assistant
- Copied all 135 mobile source files into `c:\Users\DELL\Documents\chinaza\builds\Beginora`
- Renamed package to `beginora`, updated `app.json` slug and bundle identifiers
- Pushed initial commit `c623dea` (156 files, 35,277 insertions) to `https://github.com/Chiboy06/Beginora.git` on `main`

### Configuration
- `package.json` — name=beginora, Expo SDK 55, RN 0.83.2. Key deps: nativewind@4.1.23, react-native-reanimated@3.17.4, react-native-mmkv@3.3.3, drizzle-orm@0.45.4, @tanstack/react-query@5.104.1, expo-av@16.0.8, expo-secure-store@57.0.4, llama.rn@0.11.4, zustand@5.0.11
- `app.json` — Android permissions: SET_ALARM, READ/WRITE_CALENDAR, READ_CONTACTS, POST_NOTIFICATIONS, FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, RECORD_AUDIO, VIBRATE, RECEIVE_BOOT_COMPLETED. iOS: NSCalendars, NSContacts, NSMicrophone, NSSpeechRecognition, NSReminders
- `app.config.ts` — dynamic Expo config reading API_URL, COGNITO_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION, ENABLE_CLOUD_SYNC from environment variables
- `tsconfig.json` — strict mode, NativeWind types, path aliases (@/*, @lib/*, @components/*)
- `babel.config.js` — NativeWind jsxImportSource preset, module-resolver, reanimated plugin last
- `tailwind.config.js` — Beginora calm sage/stone palette tokens
- `drizzle.config.ts` — dialect=sqlite, driver=expo, schema=lib/db/schema.ts
- `eas.json` — development (APK, internal), staging (APK, internal), production (app-bundle, autoIncrement)
- `.env.example` — API_URL, COGNITO_POOL_ID, COGNITO_CLIENT_ID, COGNITO_REGION, ENABLE_CLOUD_SYNC, EAS_PROJECT_ID
- `.github/workflows/ci.yml` — typecheck, lint, npm audit --audit-level=high, jest on push/PR to main/develop

### Design System
- `lib/theme.ts` — Beginora design system: sage green accent (#5C7A6B), warm linen background (#F7F4EF), WCAG 2.1 AA compliant, no red urgency signals, no streaks or guilt mechanics

### Data Layer
- `lib/db/schema.ts` — Drizzle ORM schema: tasks, task_steps, conversations, messages, memories, knowledge_files, documents, chunks, models, config, sync_queue, mcp_clients
- `lib/db/client.ts` — Drizzle client using expo-sqlite, opens beginora.db, seeds default config
- `lib/storage/database.ts` — raw SQLite layer (beginora.db), 4-version migration chain (v1=models, v2=documents/chunks, v3=tasks, v4=mcp_clients), full CRUD for all entities
- `lib/sync/sync-queue.ts` — offline-first sync queue: enqueue, getPendingItems, markSuccess, markFailed with exponential backoff (5s base, doubles per attempt, max 5 attempts), clearQueue

### State Management
- `lib/store/prefs.ts` — MMKV instance "beginora-prefs", synchronous getters/setters for language, confirmDestructive, cloudSyncEnabled, onboardingDone
- `lib/store/task-store.ts` — Zustand store with optimistic updates and rollback: loadTasks, addTask, setFirstAction, setStatus, removeTask
- `lib/store/chat-store.ts` — default language changed to "en"

### AI Core
- `lib/ai/rule-engine.ts` — 10 domain rules (write/email/clean/call/exercise/read/pay/plan/cook/apply) plus generic fallback, scoreComplexity function
- `lib/ai/decomposer.ts` — routes to LLM (complexity > 2 AND model loaded) or rule engine; LLM prompt requests JSON {firstAction, steps}; falls back to rule engine on any failure
- `lib/orchestrator/prompt-builder.ts` — Beginora persona: calm, non-clinical, executive-function focused; static system prompt for KV-cache stability; break_down_task routing rules; TIME_CONTEXT_MARKER preserved
- `lib/tools/tool-registry.ts` — break_down_task added as first tool (primary differentiator); all vesta tools retained
- `lib/orchestrator/tool-dispatcher.ts` — break_down_task case added
- `lib/native/vesta-service.ts` — updated with BeginoraServiceModule primary, VestaServiceModule fallback; startBeginoraService/stopBeginoraService exported; legacy aliases kept

### Screens
- `app/_layout.tsx` — root layout loads chat (init) and tasks (loadTasks) on startup; registers all routes
- `app/(tabs)/_layout.tsx` — three tabs: Today (🌱), Tasks (✓), Settings (⚙)
- `app/index.tsx` — main chat screen: calm empty state with 🌱 emoji, 3 prompt chips, Beginora branding, deep link handling
- `app/(tabs)/tasks.tsx` — task list with filter chips (all/pending/active/done), TaskItem with checkbox and first action display, FAB to add task
- `app/task/new.tsx` — new task: title input + optional context, triggers decompose() on submit
- `app/task/[id].tsx` — task detail: first action hero card, status controls, breakdown steps with numbered circles, regenerate button, delete with confirmation
- `app/settings.tsx` — model status, language toggle, confirm actions switch, cloud sync switch, personal context files, performance settings, diagnostics link
- `components/ChatInput.tsx` — placeholder updated to "What would you like to work on?"

### Documentation
- `docs/ARCHITECTURE.md` — full industry-standard architecture document: tech stack, data architecture, security threat model, offline-first sync, accessibility requirements, CI/CD pipeline, phased delivery roadmap
