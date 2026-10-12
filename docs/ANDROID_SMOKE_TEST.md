# Android phone smoke test — Beginora 0.2.3

Use this checklist with the refreshed APK after installing it over the earlier test build. Beginora has no bundled model; downloaded models remain in app-private storage. The build uses the existing sandbox debug signing key. If Android reports a signature conflict, stop before uninstalling the earlier build so local task/model data can be preserved.

## First launch and core offline task loop

1. Install and launch the v0.2.3 APK. Confirm the branded native splash transitions to the app within a few seconds, even when a previously selected local model is still loading. Complete the non-clinical onboarding screen and confirm the app enters the main UI without a redirect loop. Force-stop/reopen and confirm onboarding stays complete. If it remains on the native sprout, capture startup logcat before clearing app data.
2. Turn on airplane mode. Enter a task such as “I need to start my report” and select **Make it smaller**.
3. Confirm the screen shows a useful first action—not raw JSON—and the task stays usable offline (local model if installed; deterministic/manual fallback if not).
4. Start a five-minute focus session; pause/resume, finish early, and return to the task. Try **Done**, **Snooze**, and **Another first step**; confirm task state/history survive an app restart. Set a task reminder, cancel it from the task screen, and confirm no alert fires; verify snoozing does not silently cancel a separately set reminder.
5. If available, try a previously stuck task sequence and confirm the suggested-focus signal does not block normal completion/retry.

## Voice and permission behavior

1. Tap voice input and deny microphone permission. Confirm Beginora explains that permission is needed and remains usable for typed input.
2. Retry/allow permission and speak a short task. Confirm transcription fills an editable input; it must **not** auto-send or create a task until you choose the normal send/submit action.
3. Cancel the speech UI and verify the app returns to a usable screen with no stale “listening” state.
4. If testing a home-screen widget/quick-chat voice action, confirm it returns the transcript to the chat draft. Android speech processing is provider-dependent and may use a network.

## Local reminders, calendar, and email

- **Notifications:** deny permission and confirm the task/timer still works. Then allow it and schedule one task reminder. Cancel it from task detail; complete/delete the task and confirm its reminder is cancelled; tap a remaining reminder and confirm it opens the relevant task.
- **Calendar read:** open the calendar feature and read its explanation before granting permission. Deny permission once and confirm manual task entry remains available. If granted, verify a bounded event list and explicit event selection. Review a selected event and set one reminder; reschedule/move the calendar event, review again, and confirm stale reminders are not presented as current.
- **Appointment draft:** enter a title/location, continue to the native calendar editor, change the proposed time there, and save or cancel. Beginora does not book with a provider; your calendar account may sync an event you save.
- **Email:** prepare an editable draft and return from the mail app without sending. Beginora must not claim it sent/saved the email; check the mail app yourself. Recipients and body are not saved by Beginora.

## Integrations, privacy, and update path

- **Telegram:** enter token/chat ID, save, then disable Telegram and save again. Verify the Connections badge reflects configured-but-disabled. Re-enable and use **Send task summary** only if you intend to send those selected task details to Telegram. Confirm **Remove** clears saved credentials.
- **Background model:** verify the setting is off by default. Enable it only after reading the persistent-notification/battery disclosure and accepting notification permission; confirm the notification uses generic text, not the task title. Turn it off and confirm the service stops.
- **Connections/MCP:** verify live calendar/contact/notification readiness and provider data disclosures. MCP must show unavailable; no plaintext LAN pairing endpoint should start.
- **EAS updates:** without a linked project ID, expect the update status to report unavailable and normal app usage to work. Once EAS/GitHub setup is completed, test a preview update: connect to the internet, wait for download, choose **Later** and confirm no restart, then choose **Restart now** and confirm the compatible JS update applies while local task data remains.
- **Settings:** confirm the planning-aid/non-clinical disclaimer, local task storage, optional provider boundaries, permission status, and version 0.2.3.

## What to send back

For any issue, share the screen name, steps taken, expected versus actual behavior, Android version/model, and whether a local model was installed/active. Redact private task, calendar, email, contact, Telegram, and appointment data from screenshots and logs.
