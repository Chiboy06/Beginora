# Beginora notification audit — task and appointment reminders

**Review basis:** `/home/ubuntu/Beginora-latest`, `origin/main` / `HEAD` `6e20db88852138cd7bdba6a9c62c7434a76545fa` (`feat: app update`). The checkout was clean before this report was created. **Scope:** task and appointment local notifications, their UI/service/native-permission path, directly relevant persistence/config/tests. No `.env` file was read; no application source, configuration, migrations, or secrets were changed. This is a static code review plus an attempted focused unit-test run; no app/device/runtime behavior was asserted.

## Executive summary

The basic scheduling path is integrated: task detail and calendar preparation both call a shared Expo local-notification scheduler; that service validates a future timestamp, creates an Android channel, checks/requests notification permission, and schedules a date-triggered local notification. The calendar reminder layer persists notification identifiers in local configuration and handles replacement in a persistence-safe order. `expo-notifications` is declared as a dependency and plugin, and `POST_NOTIFICATIONS` appears in the Android app config.

The integration is **partial**, not demonstrably end-to-end reliable. Scheduled notifications are not reconciled when their task or calendar event is removed/changed; task scheduling can leave an orphan if the subsequent local DB write fails; the assistant/tool route drops the native notification ID and is not deduplicated against task detail. Permission-denial recovery and notification content/sound privacy behavior also need product/device validation. Appointment service unit tests exist, but the focused test command did not reach assertions: Jest/Babel stopped on duplicate Worklets/Reanimated plugins. No generated `android/` or `ios/` project is checked in, so merged native manifest/configuration and actual OS notification behavior were not verified.

## Call-path trace and what is verified in code

### Task-detail reminder

1. The task screen's one-shot **“Remind me once in 15 minutes”** action is wired at `app/task/[id].tsx:263-271`. `handleReminder` invokes `scheduleLocalReminder` with the first action or task title and a timestamp 15 minutes ahead (`app/task/[id].tsx:136-143`).
2. The shared service rejects invalid/past times (`lib/native/reminders.ts:43-52`), installs a foreground handler and creates the Android `reminders` channel (`:11-28`), then checks/request notification permission (`:30-35`). If permission is denied it returns a user-facing failure (`:54-58`); on grant it schedules a date trigger and returns the native identifier (`:59-73`).
3. On success, the task screen saves the identifier through the Zustand store and SQLite (`app/task/[id].tsx:144-149`; `lib/store/task-store.ts:118-131`; `lib/storage/database.ts:925-935`). The UI displays a success alert; service failures are shown as an alert (`app/task/[id].tsx:144-153`).
4. The same scheduler is also reachable from the assistant `set_reminder` tool (`lib/orchestrator/tool-dispatcher.ts:130-135`), through a wrapper that returns only success/message and not the identifier (`lib/native/reminders.ts:76-85`).

### Appointment reminder

1. Tapping **Review my appointments** calls `getUpcomingCalendarEvents(30, 12)` (`app/calendar.tsx:37-62`). The calendar adapter requests calendar permission only when needed, handles `canAskAgain === false`, bounds the query/list, and returns a shaped subset of event data (`lib/native/calendar.ts:18-24,26-51,53-80`).
2. The calendar screen retrieves saved reminder state for returned events (`app/calendar.tsx:49-52`). A timed event offers **Set reminder**; the picker offers 15 minutes or 1 hour and describes this as a quiet local notification (`app/calendar.tsx:113-135,84-94`).
3. `scheduleAppointmentReminder` rejects all-day events and times too close/past (`lib/native/appointment-reminders.ts:58-68`), deduplicates a saved matching event/start/lead (`:70-75`), delegates actual OS scheduling to `scheduleLocalReminder` (`:77-81`), persists the returned ID (`:83-93`), then cancels the prior ID only after successful persistence when replacing it (`:94-97`). The calendar UI surfaces the result message and marks success as set (`app/calendar.tsx:75-82`).

### Native setup evidence and limits

- `expo-notifications` is installed (`package.json:18-35`, specifically `:31`) and configured as an Expo plugin (`app.json:42-47`, `:45`). The app config lists Android `POST_NOTIFICATIONS` (`app.json:17-28`, `:22`). The scheduler explicitly creates a default-importance channel and supplies its ID on the trigger (`lib/native/reminders.ts:21-25,62-69`). This is evidence of source/config wiring, **not** proof that the merged manifest, OS permission prompt, reboot behavior, timing, banners, or sound work on a device.
- `android/` and `ios/` generated native directories are absent, so no merged manifest or native project build was inspected. The repository's Android smoke checklist asks a tester to deny then grant notifications and verify one task reminder (`docs/ANDROID_SMOKE_TEST.md`, “Permission and integration checks”); it is a checklist, not test/device evidence.
- The appointment tests cover lead calculation, invalid/too-close times, all-day rejection, persistence, duplicate prevention and replacement cleanup (`lib/native/__tests__/appointment-reminders.test.ts:30-90`). They mock Expo notifications and the shared scheduler; they do not exercise native permissions/channel setup, the task UI/store, or actual OS delivery.

## Findings

### Medium — Removing a task leaves its already-scheduled notification behind

**Evidence:** Task detail schedules a native notification and stores its identifier (`app/task/[id].tsx:136-149`). The delete action only calls `removeTask` (`app/task/[id].tsx:172-185`); the store removes the task from state and calls `deleteTask` without calling notification cancellation (`lib/store/task-store.ts:143-151`; `lib/storage/database.ts:986-992`). The shared service exposes cancellation only for the optional replacement identifier supplied to `scheduleLocalReminder` (`lib/native/reminders.ts:43-47,59-61`), and the task UI does not supply one.

**Impact:** After a user removes a task, a queued reminder can still fire with its former first-action/task text. This is confusing and can disclose task content in the OS notification surface after the task and activity have been deleted from the app. The task's done/snoozed state likewise has no visible cancellation/reconciliation path.

**Suggested fix:** Add a task-reminder cancellation/reconciliation operation and invoke it before or transactionally with task removal (and define behavior for done/snoozed). Do not report deletion as complete if cancellation fails without making the residual reminder clear to the user. Add tests for deletion/status transition cleanup.

### Medium — Appointment reminders are not reconciled when calendar data changes

**Evidence:** Appointment preferences are keyed by both event ID and event start timestamp (`lib/native/appointment-reminders.ts:27-29`). Scheduling looks up only the key for the current event (`:70-75`); when a matching saved record is found it returns early based on start and lead, without checking whether the current title/content differs (`:72-75`). For a changed start, the new start produces a different key; the code schedules and persists a new notification but only cancels an old record found under that new key (`:83-97`). The calendar screen loads records only for the events currently returned from the calendar query and has no removal/change cleanup (`app/calendar.tsx:42-52,113-135`).

**Impact:** If a calendar event is moved, deleted, or renamed while a reminder is pending, the old notification can remain queued. A moved event can gain a new reminder while the old one still fires at the former time; a rename at the same time can keep sending the old event title. This risks stale, duplicate, or misleading appointment notifications.

**Suggested fix:** Reconcile saved appointment reminder records against current calendar event IDs/starts and cancel obsolete native IDs; make event identity/content updates explicit. Add tests for moved/deleted/renamed events and cleanup failures.

### Medium — Task reminder can be scheduled but not recorded if local persistence fails

**Evidence:** The task screen schedules first, then persists the returned ID (`app/task/[id].tsx:140-149`). Its catch path only displays a generic failure alert (`:150-152`). The store reverts its in-memory task if `updateTaskReminderId` fails (`lib/store/task-store.ts:118-131`) but has no access to or cancellation of the just-created identifier. The underlying local notification has already been scheduled by the service (`lib/native/reminders.ts:62-70`). In contrast, appointment reminders explicitly cancel the new native notification if writing the record fails (`lib/native/appointment-reminders.ts:88-93`).

**Impact:** A user may be told the task reminder was not set (or only see a generic failure) while a notification remains scheduled, and the task has no stored ID with which to manage/cancel it. Retrying can add a duplicate.

**Suggested fix:** Mirror the appointment transaction pattern: if saving the task ID fails, cancel the newly scheduled native notification and surface a clear failure. Add a test for SQLite write failure after successful scheduling.

### Medium — Assistant `set_reminder` path drops the ID and is not managed with task reminders

**Evidence:** The dispatcher routes the assistant tool to `scheduleReminder` (`lib/orchestrator/tool-dispatcher.ts:130-135`). That wrapper calls `scheduleLocalReminder` but returns only success/message/error, discarding the `identifier` (`lib/native/reminders.ts:76-85`). By contrast, task detail persists the ID (`app/task/[id].tsx:144-149`) and disables its own button only when its task record has an ID (`:263-271`).

**Impact:** An assistant-created reminder has no app-side ID exposed for cancellation or deduplication. If the user then opens the same task and schedules via the button, its local record will not show the assistant-created notification and a duplicate can be created. This is a second ownership/lifecycle path, although both routes share the underlying native scheduler.

**Suggested fix:** Decide whether tool-created reminders are task-associated. If so, return/persist an ID against the task and use the same lifecycle/cancellation model; if they are intentionally standalone, expose a local reminders-management surface and make the assistant response accurately describe its unmanaged status. Add cross-entry-point deduplication tests.

### Low — Notification permission denial has no “cannot ask again” recovery path

**Evidence:** `ensurePermission` checks only `current.granted` and unconditionally calls `requestPermissionsAsync` otherwise (`lib/native/reminders.ts:30-35`). The appointment/calendar adapter explicitly checks `canAskAgain === false` before requesting again (`lib/native/calendar.ts:18-24`), but notification permission handling has no equivalent state check, Settings deep link, or settings instructions. On denial the scheduler returns only “Notifications are off…” (`lib/native/reminders.ts:56-58`).

**Impact:** After a user has permanently denied notification permission, tapping the reminder control may fail again without a useful route to enable it in OS Settings. Core task/calendar use remains available; the limitation is reminder recovery/clarity.

**Suggested fix:** Inspect `canAskAgain`/platform permission status, explain that permission must be enabled in Settings when re-prompting is no longer available, and offer an OS Settings route where supported. Test first denial, repeat denial/permanent denial, and granted states.

### Low — “Quiet” notification claims conflict with foreground sound configuration; content privacy needs an explicit choice

**Evidence:** The shared foreground notification handler sets `shouldPlaySound: true` (`lib/native/reminders.ts:13-19`), while scheduled notification content sets `sound: false` (`:62-68`). Appointment UI calls the notification “quiet” (`app/calendar.tsx:84-88`), and task success calls it “quiet” (`app/task/[id].tsx:144-150`). Notification bodies contain the task text/first action (`app/task/[id].tsx:140-143`) or appointment title (`lib/native/appointment-reminders.ts:77-80`); the handler requests banner/list presentation (`lib/native/reminders.ts:13-19`).

**Impact:** The code contains conflicting foreground-versus-payload sound intent, so “quiet” is not verified across app states/platforms. The locally queued OS notification can also display potentially sensitive task/event text on a notification surface, depending on user OS lock-screen settings. Code confirms local scheduling, not remote transmission or exact lock-screen rendering.

**Suggested fix:** Align the foreground handler and payload with the intended silent/audible policy, then validate on iOS and Android in foreground/background. Consider a privacy setting or generic notification body (and explain OS lock-screen visibility) for sensitive tasks/appointments.

### Medium — Focused notification unit test could not execute in this checkout

**Evidence:** The focused command `node_modules/.bin/jest --runInBand lib/native/__tests__/appointment-reminders.test.ts` failed before collecting/running tests with “Duplicate plugin/preset detected” for `react-native-worklets/plugin` and `react-native-reanimated/plugin`. The project Babel config lists both plugins (`babel.config.js:20-23`) while Jest loads the `jest-expo` preset (`jest.config.js:3-5`). Result: 1 suite failed to run; **0 tests ran**. This establishes a test-harness blocker, not a failure of notification runtime behavior.

**Impact:** The existing appointment unit assertions could not be independently verified in this review, and there is no notification-service/task reminder test coverage to compensate. No device evidence is available.

**Suggested fix:** Reconcile Babel/Jest plugin composition (keeping the required Worklets/Reanimated ordering while ensuring each plugin is loaded only once), then run the focused suite and add direct service/task lifecycle tests. Do not treat the smoke-test checklist as evidence that the scenarios passed.

## Test gaps and follow-up validation

- No tests exercise `lib/native/reminders.ts` directly: invalid/past boundary, permission granted/denied/permanently denied, Android channel configuration, service exceptions, scheduled payload, or returned identifier.
- No task screen/store integration tests cover reminder ID persistence, duplicate attempts through the UI, DB-write failure cleanup, task deletion, completed/snoozed tasks, or stale IDs after delivery/cancellation.
- Existing appointment tests mock `scheduleLocalReminder`; no tests prove native permission/channel configuration, event rename/move/delete reconciliation, notification cancellation failure, or UI state after a reminder fires.
- Run the Android smoke checklist on the generated build after the Babel/test blocker is fixed; inspect the merged manifest and verify Android 13+ permission grant/denial, foreground/background delivery, reboot behavior, and actual sound. Test an iOS build for permission denial/re-prompt and foreground presentation as well. These remain unverified in this static review.

## Verified sound/code-level positives

- The UI makes reminder scheduling an explicit action, and permission is requested inside the scheduler called by that action rather than on app launch (`app/task/[id].tsx:136-143`; `app/calendar.tsx:75-94`; `lib/native/reminders.ts:30-35`).
- Task times are checked for invalid/past values (`lib/native/reminders.ts:49-52`); appointment reminders additionally reject all-day events and unsupported/too-near lead times (`lib/native/appointment-reminders.ts:15-25,62-68`).
- Appointment replacement preserves the old notification until the new preference is persisted, then attempts to cancel the old ID (`lib/native/appointment-reminders.ts:83-97`). This good transaction shape should be reused for task reminders.
- Notification setup is offline/local at the code path (`lib/native/reminders.ts:62-69`); the appointment UI explicitly describes no service transmission (`app/calendar.tsx:84-88`). No remote notification provider or backend schedule call appears in the reviewed call path.
- Android notification dependency/plugin/permission declarations are present (`package.json:31`; `app.json:17-28,42-47`). Actual generated/merged Android manifest and device behavior remain unverified.
