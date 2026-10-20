# Devpost project story (paste into the submission form)

## Inspiration

Starting is the hardest part. People with ADHD often know exactly what they need to do and still can't begin, and most productivity apps make it worse by asking for consistent logging, the same executive skill that ADHD makes hard. In much of Africa and Asia, ADHD is under-diagnosed and support is expensive or missing, and cloud AI tools need data plans and send personal information to servers. We wanted an assistant that lowers the cost of starting, works offline on an ordinary Android phone, and keeps what you're struggling with private.

## What it does

Beginora turns a task you choose into one concrete first step you can start in about 30 seconds, then supports a calm five-minute focus session.

- **Planner:** a small language model (Qwen3) runs on the phone through llama.cpp. Its plan must pass a strict schema before it is shown; otherwise an offline rule engine answers.
- **Safety first:** crisis, medical and prompt-injection text gets a fixed, reviewed reply before any model call.
- **Gentle check-ins (opt-in):** a background scan notices a task that seems stuck, untouched for a day or running very long, and sends at most one calm notification per task per day, never between 22:00 and 08:00.
- **Phone-use patterns (opt-in):** with Android Usage access, it notices long scrolling in feed apps or rapid app switching while a task waits. It reads app names and times only, never content, and stores or sends nothing.
- **Telegram:** `/add`, `/next`, `/stuck`, `/done`, or just describe a task. Only your chat gets replies, and Telegram can't trigger calls, texts or calendar actions.
- **Hands-free voice:** Beginora greets you by name, listens, answers aloud and listens again. Say "yes" or "no" to approve an alarm or a text, and "stop" to end. This also helps people who can't easily use their hands.
- **Assistant tools:** alarms, reminders, calendar events, scheduled texts (a notification opens the ready-written message at the right time), email drafts, notes and Telegram messages. Anything that changes something asks first, and you send messages yourself.

## How we built it

React Native 0.88 with Expo SDK 58 and Expo Router, TypeScript throughout. On-device inference uses llama.rn (llama.cpp) with Qwen3 GGUF models; data lives in SQLite and MMKV, with the Telegram bot token in Android secure storage. Background check-ins use expo-background-task (Android WorkManager). Usage signals come from a small Kotlin module using Android's UsageStatsManager, added through an Expo config plugin. We used AI coding assistants throughout and reviewed and tested every change.

## Challenges we ran into

- **A startup trap:** if a model crashed the app while loading, every launch retried the same load. We added a marker that skips a load that never finished, with a test that fails on the old code.
- **Rambling answers:** long chats overflowed the model's 4,096-token window, pushing out its instructions. We now budget the prompt and cap replies.
- **A screen with no exit:** two files claimed the home route, so the chat opened outside the tab bar with its header hidden. A route-uniqueness test now guards against this.
- **A frozen app:** the floating task bubble was an Android `Modal`, a separate window that swallowed every touch while a task was active. It is now a plain overlay, and the chat batches streamed tokens instead of redrawing on every one.
- **Questions instead of answers:** the "break down a task" tool only showed the model's one-line reply, often a question. It now runs the validated planner and shows the actual first step.
- **A silent SDK break:** after the Expo SDK 58 upgrade, the old calendar and contacts functions became stubs that throw at runtime. Tests mocked them, so only the phone showed it. They now use the supported legacy entry points, and a test guards the imports.
- **Tiny models:** a 0.6B model picked the wrong tool, invented calendar answers, wrote invalid times and looped in conversation. We measured it against a real model, then routed clear requests to one tool, computed times in code, validated details before confirming, and answered small talk instantly. It went from 7/10 to 10/10.
- **Speed:** on a phone, even a small model takes seconds. Common actions (alarms, reminders, timers, texts, tasks) are now read straight from your words in a few milliseconds, so they work instantly with any model, or none.
- **Background limits:** Android only runs periodic work every 15 minutes or more, and some brands stop it to save battery. We designed check-ins to be cheap and rule-based, and kept the model for when the user is present.

## Accomplishments we're proud of

A useful AI assistant that works in airplane mode on a phone; proactive help that is fully opt-in and private; 67 automated test suites with 538 tests, and a real-model evaluation on a 0.6B Qwen3 (all actions and date questions correct, non-repeating conversation; 3 of 20 cases still miss general-knowledge facts, a limit of a model this small), including tests written to fail on the old code before each fix.

## What we learned

Small models need careful context management; safety rules belong in code, not only in prompts; and for ADHD, "less" (one step, one nudge, no streaks) is the feature.

## What's next

A real-model evaluation set run on desktop and on phones, data export and delete-all, tuning check-in thresholds with real users, and a small consented pilot with university students. Beginora is a planning aid, not medical care, and does not diagnose or treat ADHD.
