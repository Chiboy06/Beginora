# Changelog

All notable changes to Beginora are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
