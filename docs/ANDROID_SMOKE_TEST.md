# Android phone smoke test

Use this checklist with the new APK after installing it over the earlier test build. Beginora has no bundled model; the local model stays in the app-private device storage. If Android reports a signature conflict, do not uninstall the earlier build until you decide whether its local data/model needs to be preserved.

## Core offline task loop

1. Turn on airplane mode; open Beginora.
2. Enter a normal task such as “I need to start my report” and select **Make it smaller**.
3. Confirm the screen shows a useful first action—not raw JSON—and an honest model/fallback state. Check that task text is not sent to a server.
4. Start a five-minute focus session; pause/resume, finish early, and return to the task.
5. Try **Done**, **Snooze**, and **Another first step**. Reopen the task/history and confirm local status survives an app restart.
6. Repeat once with no model available or inference disabled; deterministic fallback/manual task use must remain available.

## Permission and integration checks

- **Notifications:** deny permission and confirm the task/timer still works. Then allow it and schedule a single task reminder; confirm it is not duplicated when revisiting the task.
- **Calendar read:** open the calendar feature and review its explanation before granting permission. Deny permission once and confirm manual entry remains available. If granted, verify the app shows a bounded list, lets you select an event before preparing a task, and does not claim to inspect your whole calendar.
- **Appointment draft:** open the appointment flow; enter a title/location, continue to the native calendar editor, change the proposed time there, and save or cancel. Beginora only creates a device-calendar event draft; it does not book with a provider.
- **Email:** create a draft and confirm it opens in the device mail composer, remains editable, and is not sent unless you tap Send in the mail app.
- **Settings:** confirm the non-clinical disclaimer, local-data/offline explanation, connection readiness, and update status. OTA updates remain unavailable until the Expo project is linked.

## What to send back

For any issue, share the screen name, the steps just taken, expected versus actual behavior, Android version/model, and whether a local model was installed/active. Redact private task, calendar, email, or appointment details from screenshots and logs.
