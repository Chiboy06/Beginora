# Fix plan from phone testing (build 0.2.12)

The owner tested on a Samsung S22+ with Gemini as the online model. This is a plan only; no code has changed yet. Each item says what you saw, the cause found in the code, the fix, and how to check it on the phone.

## What already works (keep as is)
- Several reminders in one message ("ball at 9am, jogging at 4pm, meeting at 10am…") are split and each set at its own time.
- The Gemini online model answers well, and chat can tell stories.
- The chat sometimes steers back to reminders. You said this is helpful, so it stays.

---

## 1. Voice can't create tasks, or a list of tasks (high priority)

**What you see:** typing "add a task …" creates a task. Saying a task out loud does nothing, and a spoken list of tasks never works.

**Cause in the code:**
- Tasks are only created when the message matches one fixed pattern (`lib/orchestrator/intent-router.ts:8`): "add / create / new / save / make", then "task".
  - Natural speech such as "**set** a task", "put … on my list" or "remind me to do …" does not match.
  - "add **tasks**" (plural) does not match either: `task\b` fails on "tasks".
- A message that does not match goes to the chat prompt, which has **no tools**. So the model, even Gemini, can only reply in words; it cannot create the task. Typing works because you typed the exact words the pattern expects.
- Speech-to-text also adds or drops punctuation, and may hear "add" as "at". That makes the exact pattern miss more often by voice.
- In hands-free mode the words are sent straight away, so you never see what was heard.

**Fix:**
1. Accept more phrasings: add / create / set / make / put / save / new, then task / tasks / to-do / todo / "on my list", plus "I need to … (a list)". Also allow common mishearings such as "at a task".
2. Spoken lists:
   - Split "add tasks: buy bread, call mum and go to the gym" with the splitter already built for Plan my week (`draftToTasks`). Days and times in the words become due dates.
   - Show **one** confirmation, "Add 3 tasks?", listing them, then create all three.
3. Show what was heard: the microphone fills the box ("Heard: …") so you can fix a word before sending. Hands-free mode reads back "Adding: …" before it saves.
4. When an online model is used and the message looks like a task but no pattern matched, offer a button: "Save this as a task?"

**Check on the phone:** say each of these and confirm a task appears in Plan:
- "set a task to buy bread"
- "add tasks: call mum, pay rent on Friday and go to the gym tomorrow". This should create 3 tasks with the right days.

## 2. The APK was not signed, and reinstalling deleted your model (high priority)

**What you see:** you had to sign the APK yourself before Android would install it, and your downloaded model was gone afterwards.

**Cause:**
- Android only installs an update over the old app when **both builds use the same signing key**.
- A build signed with a different key forces an uninstall, and an uninstall deletes the app's files, including the model (about 400 MB).
- The local Gradle release build uses the shared React Native *debug* key (`android/app/build.gradle:115`). That key is different on every computer, and the build file itself says it is not for real releases.
- An APK built some other way, or downloaded as "unsigned", has no key at all.

**Fix:**
1. Pick **one** key and use it for every build:
   - **Option A, simplest:** build with EAS: `eas build -p android --profile preview`. EAS creates and keeps one keystore for the app and signs every build with it.
   - **Option B, local builds:** create one release keystore once (`keytool -genkeypair …`). Keep it **outside git** and back it up. Point `android/app/build.gradle` at it through `~/.gradle/gradle.properties`.
2. Never lose the model again:
   - Keep a copy of the `.gguf` file in Downloads. Settings > Models > **Import from file** already re-uses it without downloading.
   - Add a line on the Models screen explaining this.
3. Add a "Your model is still downloaded" check after updates, so a lost model is noticed at once, not mid-question.

**Check:** install build N, then build N+1 over it **without uninstalling**. The model is still listed and loads.

## 3. Reminders have no place in the Plan grid (medium)

**What you see:** Plan shows tasks and "Sort later", but reminders don't stand out in the week/month grid. There is also no way to add a reminder from Plan.

**Cause:**
- Reminders set by chat or voice are only shown as rows under the selected day. Their dots look the same as task dots.
- Alarms ("set an alarm for 7") go to the phone's Clock app, so Beginora cannot show them at all.

**Fix:**
1. In the grid, reminders get a bell-coloured dot and tasks keep the green dot.
2. Add a **Reminders** section in Plan: upcoming ones first, each with Cancel; past ones collapsed.
3. Plan's + button offers **New task** or **New reminder**. The reminder form is just text + day + time, using the same picker.
4. Say clearly in chat replies when something went to the Clock app ("Alarm set in your Clock app").

**Check:** set a reminder by voice. It shows a bell dot on its day and appears in the Reminders section.

## 4. Repeating reminders, e.g. "drink water every 5 minutes" (medium)

**What you see:** a routine step "Drink water" runs once. You can't make it repeat every few minutes.

**Plan:**
1. In chat: "remind me to drink water every 5 minutes (until 6 pm)". This creates one **repeating** reminder (expo-notifications repeating time-interval trigger).
   - **Until:** if no end time is given, it stops at your quiet-hours start.
   - **How often:** fastest every 5 minutes, at most 12 an hour.
   - **Cancel:** from the Reminders section, or by saying "stop the water reminder".
2. In routines: each step gets an optional "Repeat every N min" (5, 10, 15, 30, 60). "Remind me to drink water" becomes a one-line routine that repeats.
3. Quiet hours (Settings > Notifications) also silence repeating reminders.

**Honest limit:** Android may delay frequent repeating notifications by a minute or two when the phone is idle (battery saving). Turning on "On-time reminders" in Permissions helps. Measure it on the S22+ before promising exact 5-minute timing.

**Check:** set "drink water every 5 minutes until <in 20 min>". You should get about 4 notifications, then they stop.

## 5. The dark mode switch "doesn't work" (medium)

**What you see:** choosing Dark in Settings changes nothing.

**Cause:** the theme is read once when the app starts (`lib/theme.ts`, "Applies the next time you open Beginora"). Nothing changes until the app is fully closed and reopened.

**Fix:**
- After choosing a theme, show "Restart now to apply?" and restart the app instantly (`Updates.reloadAsync()`, already available through expo-updates).
- A true live switch would need every screen's styles rebuilt. Larger change; not needed for the hackathon.

**Check:** choose Dark, tap Restart now. The app reopens in dark mode on the same tab.

## 6. See-through tab bar like Apple's Liquid Glass (low)

**What you see:** the bottom bar is solid.

**Cause:** the tab bar background is the plain surface colour (`app/(tabs)/_layout.tsx`).

**Fix:**
1. Use the installed `expo-blur` as the tab bar background: frosted blur, a thin light edge and a soft shadow. This is the same style already used for the cards.
2. Make the bar float over content, and add bottom padding to each tab's scroll view so nothing is hidden behind it.
3. On Android versions where blur is weak, fall back to a translucent fill.

**Check:** scroll a long Plan list. Content shows softly through the bar, and the last item can still be scrolled above it.

## 7. What your own Telegram bot does (answer, plus one gap)

When you use your own bot (bot token + chat ID in Settings):

| You do | What happens |
|---|---|
| Tap **Send to Telegram** on a task | The bot sends you the task and its first step. |
| Ask in chat "send to my Telegram: …" | The bot sends that text, after you confirm. |
| Turn on **Reply to my Telegram messages**, then message your bot | Beginora answers from your phone. |

What the bot answers, when two-way replies are on:
- `/add <task>`: saves the task and replies with a first step.
- `/next`: your current task and its first step.
- `/stuck`: a smaller first step for the current task.
- `/done`: marks the current task done.
- Any other text: a suggested first step, plus "send /add to save it".
- It only answers **your** chat ID; anyone else is ignored. It runs while the app is open or kept in the background (Settings > Assistant > keep running).

**Gap found:** reminders are **not** sent to Telegram. `sendTelegramReminder` exists (`lib/telegram/telegram-service.ts:107`) but nothing calls it.

**Fix:**
- Add a switch "Also send my reminders to Telegram".
- When a reminder or task reminder is set, also queue it to Telegram at that time. The relay or the background task sends it when due.
- Simplest first step: send "Reminder set for 9:00: play ball" immediately when it's set.

## 8. Asking questions about a document (before you test)

- Document search needs the small **embedding model** (Nomic Embed, in Settings > Models), as well as a chat model.
- Without it, importing shows "embedding model missing". Download it first, then import the document in Settings > Documents, then ask in Talk.
- Plan: if the embedding model is missing, offer a one-tap "Download it now" button instead of an error.

---

## Suggested order

1. Voice tasks and lists (item 1). This is the biggest gap you hit.
2. Signing on one key (item 2). Do this before sending the APK to anyone else.
3. Reminders in Plan, plus repeating reminders (items 3 and 4).
4. Dark mode restart (item 5) and reminders to Telegram (item 7).
5. Glass tab bar (item 6).

Every item comes with tests. Voice phrasing and list splitting are pure functions, testable without a phone. Signing, repeat timing and blur still need a check on the S22+.
