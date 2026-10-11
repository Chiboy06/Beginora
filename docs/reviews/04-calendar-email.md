# Beginora calendar and email connector audit

**Review baseline:** `/home/ubuntu/Beginora-latest`, `origin/main` commit `6e20db88852138cd7bdba6a9c62c7434a76545fa` (checkout branch `fix/integrate-latest-updates`).
**Scope:** Calendar and email connectors, permission boundaries, directly related routing/config/tests. Static inspection only; no app/device execution or tests run. No application files, secrets, migrations, or git history were changed. `.env` files were not read.

## Executive summary

The main connector paths are substantially present: a user-triggered calendar review requests read permission only when needed, returns a bounded 30-day/12-event list, and has a separate calendar editor handoff for creation; email uses the installed system composer rather than an in-app send API. Dependencies and Expo calendar permission configuration are present in the checkout. These are **code-path findings**, not proof of platform runtime behavior.

The integration is **partial**, chiefly because calendar reads have two differently bounded/shaped implementations, and the email adapter ignores the composer’s resolved outcome and always reports the same “editable draft opened” success. Automated tests currently cover basic calendar-list shaping and email validation, but not the end-to-end handoffs, the permission service, or the alternate assistant calendar-read path. No test/device evidence is available from this review.

## Call paths and boundaries traced

### Calendar review and assistant query

- The appointments screen calls `getUpcomingCalendarEvents(30, 12)` after the user taps **Review my appointments** (`app/calendar.tsx:37-62`, especially `:42`); the screen explains that permission is requested on that action (`app/calendar.tsx:99-108`).
- `getUpcomingCalendarEvents` validates the requested range/limit, reads current permission, asks only if it is not granted and can still be requested, then reads all event calendars and their events (`lib/native/calendar.ts:18-24`, `:26-46`, `:48-77`). It shapes a small set of fields, removes matching duplicates, sorts, and caps results at `limit` (`:52-75`). Exceptions in this path are turned into a manual-fallback message (`:78-80`).
- Separately, the assistant tool dispatcher maps `get_calendar_events` to `getCalendarEvents` (`lib/orchestrator/tool-dispatcher.ts:159-160`). The assistant treats read/query tools as inline data calls rather than confirmation-gated actions, then supplies returned data to a follow-up model generation (`lib/orchestrator/orchestrator.ts:172-201`). `getCalendarEvents` validates a local date, uses the same permission helper, reads that day, and serializes title/start/end/location/all-day fields (`lib/native/calendar.ts:94-140`). That function's permission check is before its `try` (`:106-113`). The tool definition is explicitly `confirmRequired: false` / `returnsData: true` (`lib/tools/tool-registry.ts:217-234`). An OS calendar permission dialog remains the platform permission gate on first read; there is no separate app confirmation before this read tool executes.
- The connector overview reads current statuses without requesting permission (`lib/connectors/permission-service.ts:13-37`) and refreshes on screen focus (`app/connectors.tsx:32-37`). The connector registry is explicitly descriptive, not the action authorization mechanism (`lib/connectors/registry.ts:3-7`).

### Calendar create/editor handoff

- The appointment form validates that there is a title, proposes a default time one hour in the future, and opens a calendar editor (`app/appointment/new.tsx:25-45`). Android goes through `createEvent` and the custom native module; non-Android goes through `expo-calendar/legacy` `createEventInCalendarAsync` (`:46-66`). This is an editor handoff, not direct persistence by Beginora. Android's Kotlin module creates an `ACTION_INSERT` intent with event fields and launches it (`native/android/src/main/java/app/beginora/android/SystemActionsModule.kt:118-138`). The native bridge reports that the editor opened, not that the user saved (`lib/native/system-actions.ts:113-138`).
- Calendar setup is represented in the checked-in Expo config: iOS calendar usage descriptions are set (`app.json:30-40`) and the `expo-calendar` config plugin is registered with a permission string (`app.json:57-62`). `expo-calendar` is a dependency (`package.json:21-30`); the custom Android module is copied/registered by the configured `./plugins/with-system-actions` plugin (`app.json:69-70`, `plugins/with-system-actions.js:30-56`, `:89-155`). No generated `ios/` or `android/` project was present in the inspected checkout, so generated native manifests/builds are not verified.

### Email draft handoff

- The task detail screen can navigate to `/email` with a prefilled subject/body (`app/task/[id].tsx:274-283`); the email screen holds recipient, subject, and body in React state, validates them, then calls `openEmailDraft` (`app/email.tsx:8-33`). The UI says the recipient is optional and tells users the provider may sync after sending (`:40-55`, `:89-91`).
- The adapter bounds recipient count and subject/body lengths, checks composer availability, and passes trimmed recipients and bounded text to `expo-mail-composer` (`lib/connectors/email-connector.ts:13-23`, `:25-53`). It does not implement a mail-provider API or direct-send capability; `email.send` is absent from the declared registry capability tests (`lib/connectors/__tests__/registry.test.ts:9-22`).
- The composer is included as a dependency (`package.json:30`); email is classified as a user handoff that can leave the device (`lib/connectors/registry.ts:23-34`). It does not require an OS permission prompt; the permission/status service instead checks composer availability (`lib/connectors/permission-service.ts:14-28`).

## Findings

### 1. Medium — Calendar assistant read and appointment-list read do not share bounds or shaping

**Evidence:** The appointment UI uses `getUpcomingCalendarEvents(30, 12)` (`app/calendar.tsx:42`) and that helper validates limits, deduplicates by normalized title/time, sorts, and slices (`lib/native/calendar.ts:33-37`, `:52-75`). The assistant route independently calls `getCalendarEvents` (`lib/orchestrator/tool-dispatcher.ts:159-160`), which reads a complete day and serializes every returned event without a result cap or duplicate removal (`lib/native/calendar.ts:115-140`). Its result is inserted into follow-up model context (`lib/orchestrator/orchestrator.ts:190-201`).

**Impact:** A user can see different counts (including cross-calendar duplicates) depending on whether they use the appointments screen or ask the assistant. A busy day can also create a much larger response/model context than the bounded list screen. The intended one-day date window is bounded, but the number of entries is not.

**Suggested fix:** Factor permission/read/shaping into a shared helper with an explicit maximum event count and consistent duplicate policy; preserve an honest truncation indicator. Add tests for same-time duplicates, high-volume days, and parity between both paths.

**Confidence:** High (direct code comparison; no runtime test).

### 2. Medium — Email handoff reports success without inspecting how the system composer ended

**Evidence:** `openEmailDraft` awaits `MailComposer.composeAsync(...)` but discards its returned value, then unconditionally returns the message “Your email app opened with an editable draft. Review it there before sending.” (`lib/connectors/email-connector.ts:38-46`). The screen displays that result as the completion message (`app/email.tsx:30-32`, with the pre-handoff wording at `:40-42`).

**Impact:** A resolved composer interaction is represented as an editable draft even when the user has already dismissed the composer, saved, cancelled, or otherwise completed its native flow. The message is not a trustworthy status of what happened, which can cause confusion about whether the draft remains open or whether the user must still send it. The code does not itself send mail, but it also cannot truthfully report that the user did not send from the email app.

**Suggested fix:** Inspect and map the composer result into distinct user-facing outcomes; if status cannot be determined on a platform, say only that control returned from the mail app and Beginora cannot verify send/save state. Add mocked tests for each resolved outcome, unavailable composer, and rejection.

**Confidence:** High (the unconditional success branch is visible in source; platform outcomes were not device-tested here).

## Verified working in source/tests (not runtime behavior)

- Calendar read is explicitly user-invoked from the appointments screen and uses bounded defaults (30 days, 12 events); invalid windows/limits fail before permission access (`app/calendar.tsx:37-45`; `lib/native/calendar.ts:26-46`).
- Calendar access is checked before the read; if the user previously denied it permanently, the list path does not re-request and returns a manual-use message (`lib/native/calendar.ts:18-23`, `:41-46`). The unit test asserts this denial branch does not request permission or read events (`lib/native/__tests__/calendar.test.ts:32-38`).
- The list helper has unit coverage for bound validation, denied access, sorting, duplicate suppression, cap, and selecting both calendars (`lib/native/__tests__/calendar.test.ts:26-59`). This is mocked evidence only.
- Calendar creation is an explicit editor handoff in both platform branches in source; the Android implementation uses `ACTION_INSERT` and the comments avoid claiming save before user action (`app/appointment/new.tsx:46-66`; `native/android/src/main/java/app/beginora/android/SystemActionsModule.kt:118-138`; `lib/native/system-actions.ts:128-134`).
- Email draft input is bounded and validates recipient syntax/count; a blank recipient is intentionally accepted so the user can pick in their mail app (`lib/connectors/email-connector.ts:13-23`; `lib/connectors/__tests__/email-connector.test.ts:9-27`).
- Registry tests assert email has compose but not send/delete capabilities, and describe email as a handoff with data leaving the device (`lib/connectors/__tests__/registry.test.ts:9-22`, `:34-39`).
- Permission overview reads statuses only and uses `Promise.allSettled`, preventing one unavailable permission API from rejecting the whole snapshot (`lib/connectors/permission-service.ts:13-37`). No test validates its status mapping.

## Test gaps and caveats

- `lib/native/__tests__/calendar.test.ts` imports/tests only `getUpcomingCalendarEvents`; there is no test for `getCalendarEvents` date boundaries, permission request/rejection, event shaping, exception behavior, or assistant/tool dispatch into it.
- `lib/connectors/__tests__/email-connector.test.ts` tests only `validateEmailDraft`; there are no tests for `MailComposer.isAvailableAsync`, `composeAsync` argument mapping/result handling, exceptions, or `/email` UI integration.
- There are no connector permission-service tests for granted/denied/not-requested/unavailable state mapping or the connector screen's refresh/fallback behavior.
- No Android/iOS build, simulator, device, or system composer/calendar editor was run. Static configuration and source presence do not prove native plugin execution, permission prompt behavior, installed app availability, event persistence, or email send/save status.
- No application changes were made; only this review report was written.
