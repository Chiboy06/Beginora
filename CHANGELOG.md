# Changelog

All notable changes to Beginora are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.2.7] — Android upgrade build

### Changed
- Increment Android `versionCode` to 9 so this build can be installed over v0.2.6; application features are the changes already merged through the current mainline.

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
