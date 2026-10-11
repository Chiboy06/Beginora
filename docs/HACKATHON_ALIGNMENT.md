# Beginora × UnivaBio hackathon alignment

**Challenge framing.** The official UnivaBio challenge theme is “Artificial Intelligence for Human Health.” Beginora’s responsible fit is the “live with it more easily” part: an offline-first, user-directed executive-function aid that turns a stated intention into one manageable first action. It is not a diagnostic or treatment product, does not claim to detect ADHD or hyperfocus, and does not replace professional support.

## Current demo story

1. Enter a difficult task in plain language. When a compatible local model is installed, it can help shape the plan; malformed or unavailable inference falls back to deterministic offline rules.
2. Review one prominent first step, then start a low-pressure five-minute session, finish early, mark the step done, snooze, or ask for another step. Task state and outcomes remain in local SQLite.
3. Optionally review a bounded set of upcoming events after a contextual calendar-permission request. Select an event to prepare a task; schedule at most one local reminder for a timed appointment.
4. Create an appointment draft in the device calendar editor; the user reviews and saves it there. Beginora does not book with a clinic or provider.
5. Draft an email in the user’s mail app. Beginora never sends it; the user reviews and chooses whether to send.
6. Show the offline path, privacy boundaries, permission-denied alternatives, and the non-clinical disclaimer in Settings.

## Judging-rubric emphasis

| Criterion | Demo evidence to emphasize |
|---|---|
| Idea & Innovation | A practical task-starting intervention, not another dashboard; local inference and one small next action reduce setup overhead. |
| Implementation | A working Android app with local SQLite, an existing on-device model path, deterministic fallback, bounded calendar access, local notifications, and native handoffs. |
| Health Impact & Rigor | The target problem and intended user benefit are stated as a hypothesis; the app makes no diagnosis or efficacy claim and keeps the user in control. |
| Design & Usability | Calm, low-density screens, accessible controls, readable translucent surfaces, and no streaks, shame, or compulsory setup. |
| Presentation | Show the complete task-to-focus loop, demonstrate at least one consented integration, and clearly distinguish verified behavior from roadmap items. |

## Submission checklist

The official challenge lists an interactive prototype, a demo video, a one-page project description PDF, and the GitHub repository/code. The app build is the priority; a recorded video must be made on the real test phone and must not imply features that were not exercised. Confirm the submission account meets the official student/age eligibility rules before entering.

## Deadline caveat

The official page and rules show **October 14, 2026 at 03:45 UTC**, while the separate schedule page shows **October 21, 2026 at 03:45 UTC**; the page also contains inconsistent countdown text. Use October 14 as the conservative planning deadline and verify the actual Devpost dashboard or organizer notice before relying on the later date.

## Sources

- [Challenge page](https://univabio.devpost.com/)
- [Official rules](https://univabio.devpost.com/rules)
- [Official dates](https://univabio.devpost.com/details/dates)
