# Why people drift away from Beginora, and the plan to fix it

Date: 29 October 2026. Built on these skills and sources:
- **Skills:** BJ Fogg's B=MAP / Tiny Habits (`wondelai/skills@improve-retention`), Daniel Pink's Autonomy, Mastery, Purpose (`wondelai/skills@drive-motivation`), the Hook Model and its ethics check (`wondelai/skills@hooked-ux`), and Lenny's retention and onboarding notes (`refoundai/lenny-skills`).
- **Research:** ADHD app research (see Sources).

## Diagnosis (from the code, not guesses)

| Problem | Where | Retention stage |
|---|---|---|
| Onboarding is three paragraphs and "I understand", then an **empty** Today screen. No first task, no first step, no first win. | `app/onboarding.tsx` | Day 0: no "first value in 60 seconds" |
| **Nothing brings you back.** Check-ins, the daily mood question and the weekly plan are all **off by default**, and nothing offers them at the right moment. | `prefs` defaults | Days 1–3: no prompt, so the app is forgotten ("I keep forgetting about it") |
| Finishing a task only ticks a box. **No moment of success.** | Plan, Today, Focus, routines | Days 7–30: without a felt win, no habit forms |
| **Progress is invisible.** Only "done today" exists; no week, no history of wins. | Today | No sense of getting better, no growing value |
| **No learning at all.** | — | No mastery, no reason to open the app on a good day |

Research check:
- Reminders alone fade after the first weeks, so prompts must be few and tied to something real.
- Interactive, in-app learning beats a leaflet for adults with ADHD.

## The plan: five pieces, smallest first

**1. Onboarding that ends in a first win, in under a minute**
- Steps:
  1. Your name.
  2. "What's one thing you've been putting off?" (say it or type it).
  3. Beginora shows **one tiny first step** at once. It works with no model.
  4. Choose **Start 2 minutes** or **Save it**.
  5. "When should I check in with you each day?" with choices: morning, lunch, evening, or not now. Notification permission is asked here, with the reason shown.
- You leave onboarding with a real task, a first step, and one daily anchor.
- Reuses: the planner, `addTask`, Focus, and the check-in scheduler.

**2. One daily check-in, built from your real day (opt-in, one a day)**
- At your chosen time, one notification with something real in it:
  - your next first step ("Your first step: open the essay file. 2 minutes?"); or
  - if nothing is planned, "Anything on your mind? Capture it in 10 seconds."
- Respects quiet hours. Off in one tap. Never "We miss you!".

**3. A small moment of success**
- Finishing a task, a focus session or a routine shows a short card with a light buzz: "Done. That's 4 this week."
- The wording varies and is never childish; motion is reduced if the phone asks for it.
- Rewarded after the fact ("now that you did it"), never with points. A planned "Learn" reflection is skipped if you dismiss the card.

**4. "Your week": progress you can see**
- A card on Today with tasks started and finished, focus minutes, routines done, and the week's moods.
- A **Wins** list of everything finished, newest first.
- It compares only with your own good weeks ("your best week so far"), never a streak you can lose. The more you use Beginora, the more of your own history it holds.

**5. Learn: two-minute ideas you try straight away**
- About 15 short lessons on well-known ADHD-friendly strategies:
  - starting tasks (the 2-minute start);
  - time blindness (making time visible);
  - body doubling;
  - if-then plans;
  - getting things out of your head;
  - breaking tasks down;
  - rewards after effort;
  - transitions;
  - overwhelm resets;
  - evening wind-down;
  - planning the week;
  - and more.
- Each lesson is 3 short cards, then a **"Try it now"** button that opens the matching feature (Capture, Focus 5 min, a routine, Plan my week), then one reflection question saved to your journal.
- Today shows one "2-minute idea" each day. A "Learn" list shows what you've tried: "6 of 15 ideas tried" (mastery, no pressure).
- Written plainly and carefully: planning support, **not treatment**, matching the app's disclaimer. Fully offline.

## What I recommend NOT building (ultra review)

- **Streaks, points, badges, leagues.** For ADHD users a broken streak often means shame and quitting. The hooked-ux skill's own ethics check warns against hooks on vulnerable users, and Beginora already chose "no streak to lose".
- **Community or social features.** They need a server, moderation and privacy work, against the local-first rule.
- **A home-screen widget.** It needs native Android code that can't be tested before the hackathon.
- **Usage tracking or analytics.** Beginora is local-first. Instead, run a small pilot with 5–10 people and one weekly question: "Did Beginora help you start something this week?"

## Sources

- Fogg, *Tiny Habits*; Pink, *Drive*; Eyal, *Hooked* (via the skills above)
- [Digital therapeutics for mental health: is attrition the Achilles heel?](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9380224/)
- [Self-guided internet ADHD program: SMS reminders and adherence](https://hvlopen.brage.unit.no/hvlopen-xmlui/handle/11250/3039341?show=full)
- [Super Brains app: psychoeducation for adults with ADHD](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10417394/)
- [Chatbot-supported psychoeducation in adult ADHD, RCT (BJPsych Open 2023)](https://doaj.org/article/4408171d737f4328ac09ba39ee5d9bbc)

## Added 29 October: voice like ChatGPT/Gemini, screen time, stories

### Already fixed (0.2.17)
- A whole day's plan in one sentence ("read by 5, jogging by 6 … sleeping by 11") is read back and becomes timed tasks with reminders.

### 6. Talk to it like ChatGPT or Gemini

**How the big apps do it (research):**
- ChatGPT Advanced Voice and Gemini Live use one model that hears and speaks audio directly, in the cloud, with the server detecting when you start talking. That is why you can interrupt them mid-sentence.
- Most other voice apps chain listen → think → speak, but **stream** every step. The reply starts playing before the whole answer is written, and a small detector decides when you have finished your thought.

**Why Beginora feels different (cause found):**
- Each turn opens Google's separate speech pop-up (`BeginoraVoiceActivity`), listens once and closes.
- Beginora then waits for the **whole** reply before speaking.
- Listening itself is not the problem: the words are heard correctly.

**Plan, local first:**
1. **Listen inside Beginora, continuously.** No pop-up. A calm listening orb, your words appearing live as you speak, and on-device recognition where the phone supports it (Android 13+ offline language packs). Uses `expo-speech-recognition` 58.0.1, which matches Expo SDK 58.
2. **Know when you have finished.** Wait a little longer when a sentence ends in "and…" or "by 6…". Do not cut you off mid-thought.
3. **Speak while thinking.** Start speaking the first sentence as soon as it is written (chat already streams words); keep a short pause between turns.
4. **Interrupting:** tap anywhere, or say "stop", to cut the voice and listen. True talk-over interruption needs echo cancelling so Beginora does not hear itself; try it as an experimental switch only after measuring it on the S22+.

**Not now (ultra review):**
- A downloaded speech model such as Whisper or sherpa-onnx: 40–100 MB+, and it fixes listening, which already works.
- Gemini Live native audio: cloud-only, against local first. It could become an opt-in "Live voice (online)" using your own Gemini key later.

### 7. Screen time and app limits

- **What exists:** Beginora already reads per-app usage (with your permission) and answers "how much time on my phone today?" in Talk.
- **Add a Screen time page:**
  - today and this week per app;
  - your most distracting apps;
  - this week compared with last week.
- **Gentle limits:**
  - set daily minutes per app;
  - Beginora's background check (about every 15 minutes, an Android limit) sends **one** kind note when you pass a limit: "Instagram: 40 of 30 minutes. Want to switch to your first step?", with a button to open Focus.
- **Hard locks:** a button opens Android's own Digital Wellbeing app timers, which really lock the app.
  - Beginora does not lock apps itself: on Android that needs an accessibility service, which Google Play restricts for apps like this.

### 8. Stories and interactive sessions

- **Lessons as short stories:** each Learn lesson becomes a 1-minute story about someone with the same struggle. You choose what they try next, see what happens, then press "Try it now" yourself.
- **Guided voice sessions** (spoken by Beginora, works offline), for example:
  - **Brain dump** (2 min): say everything on your mind; it becomes tasks.
  - **Body doubling** (10–25 min): Beginora "sits with you" with short check-ins.
  - **Wind-down** (5 min): review the day, set tomorrow's first step, then how was your day.
- Free-form stories in Talk already work with the phone or online model.

### Sources for 6–8
- OpenAI GPT-4o realtime / Advanced Voice: [Microsoft Tech Community, GPT-4o Realtime best practices](https://techcommunity.microsoft.com/blog/azure-ai-services-blog/-/4373584), [launch coverage](https://beebom.com/chatgpt-advanced-voice-rolling-out/amp/)
- [Google Gemini Live API overview](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api)
- [LiveKit: voice agent architecture (STT, LLM, TTS pipelines)](https://livekit.com/blog/voice-agent-architecture-stt-llm-tts-pipelines-explained)
- On-device speech in React Native: [react-native-sherpa-onnx](https://github.com/XDcobra/react-native-sherpa-onnx), [whisper.rn](https://www.mintlify.com/mybigday/whisper.rn)
