# Competitive Audit: Beginora and Similar Products

Date: 20 October 2026. Scope: products online that do part of what Beginora does, how they differ, and where Beginora stands.

## 1. What Beginora is (baseline for the comparison)

Facts taken from this repository (branch `fix/v0.2.9-hands-free`, version 0.2.10):

- An Android app (Expo SDK 58, React Native) for people who struggle to start tasks, with ADHD as the main audience.
- The language model runs on the phone (llama.rn / llama.cpp, GGUF files such as Qwen3 0.6B). Chat works with no internet once a model is downloaded.
- Common actions run without the model at all: alarms, timers, reminders, texts, scheduled texts, tasks, date and time questions, greetings. Keyword routing fills the details from the user's words.
- Every action that leaves the app (SMS, call, calendar, email, Telegram) asks for confirmation first.
- Opt-in background check-ins (WorkManager) and opt-in screen-usage signals (Android Usage Access).
- Two-way Telegram bot for low-resource use, hands-free voice, document search (RAG), long-term memory, and a local MCP server.
- Reminders ring on a high-importance channel and are listed in the Tasks tab.
- Measured limits: the real-model eval with Qwen3 0.6B passes 17 of 20 cases. The three failures are factual questions (Nigerian states, Independence Day). iOS is not tested.

## 2. The landscape by category

### 2.1 ADHD planners and coaching apps

| Product | What it does | Model and data | Price (as found) |
|---|---|---|---|
| Tiimo | Visual daily planner, timers, AI planning help | Cloud | Subscription |
| Goblin Tools | "Magic ToDo" breaks a task into steps, tone checker, estimator | Cloud LLM | Web free, small one-time mobile fee |
| Numo | ADHD courses, gamified to-dos, community, brain dump to tasks | Cloud | About $7.99–$15.99 per month |
| Inflow | CBT-based ADHD program, coaching sessions | Cloud | About $200 per year; reviewers report billing complaints |
| Saner.AI (Skai) | Notes, tasks, email and calendar around a chat assistant; brain dump to tasks | Cloud; reads Gmail and Drive when allowed | Free tier 30 AI messages per month; paid about $8–$16 per month (sources disagree) |
| Shimmer | Human ADHD coaching | Human coaches | About $230 per month |
| Routinery / Structured | Guided routines with step timers / visual timeline | Mostly on device, no LLM | About $20–$27 per year |
| Focus Bear | Routines plus app and site blocking | Cloud account | Pro about $4.99 per month |

### 2.2 On-device LLM apps

| Product | What it does | Strengths | Gaps compared with Beginora |
|---|---|---|---|
| PocketPal AI | Open-source chat with GGUF models via llama.cpp, Hugging Face downloads, personas, benchmarks | Model choice, GPU support | Chat only: no alarms, reminders, texts or check-ins |
| Google AI Edge Gallery | Experimental showcase for Gemma models: chat, image questions, prompt lab | Google models, Apache 2.0 | A demo, not an assistant; installed from GitHub |
| Layla | Offline characters and agents, voices, long-term memory, scripts | Feature depth | Needs 8 GB+ RAM; general purpose, not ADHD |
| MLC Chat | Fast on-device inference with NPU support | Speed (one roundup: about 22 tokens/s vs Layla's 14 on a Galaxy S25 Ultra) | Chat only |
| AnythingLLM Mobile | MIT-licensed React Native app, bundled small model, document chat, pairs with the desktop app by QR code | Same stack family as Beginora; RAG and desktop pairing | General knowledge tool, not ADHD; no proactive check-ins |

### 2.3 Phone assistants

| Product | Notes |
|---|---|
| Gemini app / Google Assistant | Strongest general answers and deep Android control, but needs the cloud for most work. Gemini Nano runs on device only for narrow features (Recorder summaries, smart replies, Magic Compose) and is not a chatbot users talk to. Gemini Nano 4 is reported to run only on recent flagships (Pixel 10, Galaxy S26 and a few others). |
| Siri | iOS only; not relevant to an Android-first launch except as a user expectation. |

Beginora cannot match Gemini on knowledge. It differs by working fully offline on mid-range phones, focusing on starting tasks, and checking in on its own.

### 2.4 Screen-time and focus tools

| Product | Notes |
|---|---|
| Android Digital Wellbeing | Built in, free: timers, focus mode, bedtime. Reports usage but does not coach. |
| one sec | Adds a pause before opening chosen apps. A peer-reviewed field study (280 people, 6 weeks) found the "dismiss" option drove most of the effect; a Heidelberg/Max Planck result reported 57% less use of target apps (also cited by the company). |
| Forest, Opal | Gamified or scheduled blocking. Not covered by sources found in this audit. |

### 2.5 Clinical digital therapeutics

| Product | Notes |
|---|---|
| EndeavorRx (Akili) | FDA de novo authorization in 2020 for children 8–12 with ADHD, as one part of a treatment program. Based on five studies with 600+ children, including an RCT in The Lancet Digital Health; about one third of children no longer showed a measurable attention deficit on at least one measure after four weeks. Company status after 2024 was not confirmed in this audit. |

Beginora is a wellness and productivity tool, not a medical device. It must not claim to treat ADHD.

## 3. Comparison matrix

Legend: Yes, Partial, No. "?" means not verified.

| Capability | Beginora | Tiimo / Numo | Goblin Tools | Saner.AI | PocketPal / Layla | AnythingLLM Mobile | Gemini | one sec |
|---|---|---|---|---|---|---|---|---|
| Works fully offline | Yes | No | No | No | Yes | Yes | Partial | Yes |
| ADHD task start (first step) | Yes | Partial | Yes | Partial | No | No | Partial | No |
| Sets alarms, reminders, texts | Yes | Partial | No | Partial | No | No | Yes | No |
| Actions work with no model loaded | Yes | n/a | n/a | n/a | No | No | n/a | n/a |
| Proactive check-ins | Yes (opt-in) | Partial (notifications) | No | ? | No | No | No | No |
| Uses screen-usage signals | Yes (opt-in) | No | No | No | No | No | No | Yes |
| Hands-free voice | Yes | No | No | ? | Layla only | No | Yes | No |
| Messaging-app channel | Telegram | No | No | No | No | No | No | No |
| Document chat (RAG) | Yes | No | No | Yes | Partial | Yes | Yes | No |
| Human coaching or community | No | Numo: community | No | No | No | No | No | No |
| Clinical evidence | No | No | No | No | No | No | No | Field study |
| iOS | Not tested | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Price | No paywall in this build | Subscription | Free / small fee | Freemium | Free / paid | Free | Free / paid | Freemium |

## 4. What makes Beginora different

1. **Private by design.** Chat, memory, documents and reminders stay on the phone. Every ADHD competitor found (Tiimo, Numo, Inflow, Saner.AI, Goblin Tools) sends data to the cloud. Saner.AI asks for Gmail and Drive access.
2. **An assistant that acts, not only talks.** On-device chat apps (PocketPal, Layla, MLC, AnythingLLM) answer questions. Beginora sets the alarm, schedules the text and adds the task.
3. **Reliable on weak phones.** Common actions are parsed in code, so a 0.6B model, or no model at all, still sets a 7 a.m. alarm. Competitor chat apps fail when the model is weak.
4. **Proactive and opt-in.** Background check-ins and usage signals let Beginora notice a stalled task. Planners wait for the user to open them.
5. **Low-resource reach.** The Telegram bot lets people use it from a basic messaging habit; downloads resume after network drops.
6. **Safety in the loop.** Outgoing actions need confirmation, crisis wording gets a reviewed reply, and date questions are answered from the phone clock instead of the model.

## 5. Where competitors lead (honest gaps)

| Gap | Who leads | Impact | Suggested response |
|---|---|---|---|
| Factual answers | Gemini, any cloud model | High: the user saw wrong answers on Nigeria facts | Recommend Qwen3 1.7B+ on phones with 6 GB+ RAM; label small models as "quick helper, may be wrong on facts"; optional opt-in cloud fallback later |
| Speed | MLC Chat (NPU) | Medium | Keep the short prompts and warm cache; test llama.rn GPU/OpenCL on the S22+ |
| Visual routines and timelines | Tiimo, Structured, Routinery | Medium: ADHD users value seeing the day | A simple "today" timeline from tasks and reminders |
| App blocking with a pause | one sec, Opal, Focus Bear | Medium | Use the existing usage signal for a gentle "pause" nudge; avoid blocking until Play policy is reviewed |
| Human support and community | Shimmer, Numo, Inflow | Medium | Partner or link out; do not imitate coaching |
| Clinical evidence | EndeavorRx, one sec study | High for trust and funding | Run a small pilot (time to start a task, before vs after) |
| iOS | Everyone | High for reach | Expo makes it possible; usage access and alarms differ on iOS |

## 6. Risks

- **Google Play policy.** Usage Access (`PACKAGE_USAGE_STATS`) and exact alarms (`SCHEDULE_EXACT_ALARM`) need a clear in-app reason and a policy declaration. A rejected declaration blocks release.
- **Health claims.** Calling the app a treatment would put it in medical-device territory (as with EndeavorRx). Keep wording to "helps you start tasks".
- **Background limits.** Samsung and other brands stop background work aggressively. Check-ins may arrive late; the battery card in Connectors is the mitigation.
- **Small-model accuracy.** A wrong fact delivered confidently damages trust faster than a slow answer.
- **Telegram.** Messages pass through Telegram's servers, so that channel is not offline or private in the same way. Say so in the Connectors screen.

## 7. Recommendations, in priority order

1. Make the model choice honest: recommend by phone RAM and show the factual-accuracy note on models under 1.5B.
2. Prepare the Play Console declarations for usage access and exact alarms before the first public release.
3. Add a one-screen "today" timeline from existing tasks and reminders.
4. Run a small user pilot and record time-to-start; it is the claim no competitor can make offline.
5. Test the iOS build only after the Android release is stable.

## 8. Source quality

- Prices and feature lists come from vendor pages, app stores, review sites and roundups. Prices change; check before quoting.
- The MLC vs Layla speed numbers come from one roundup on one phone.
- The Gemini Nano 4 device list comes from one blog post, not an official Google list.
- The one sec 57% figure is from a university study as reported by Fortune and repeated by the company.
- EndeavorRx data is from 2020 coverage of the FDA decision; later company status is unverified.
- Forest and Opal details were not verified in this audit.

## 9. Sources

- Numo: https://apps.apple.com (Numo listing)
- Focus Bear pricing: https://www.focusbear.io/pricing
- Inflow and alternatives: https://www.getinflow.io
- Shimmer: https://www.shimmer.care
- Saner.AI pricing: https://www.eesel.ai/blog/saner-ai-pricing ; https://tooliverse.ai/tools/saner-ai
- PocketPal AI: https://github.com/a-ghorbani/pocketpal-ai
- Google AI Edge Gallery: https://getcoai.com (Edge Gallery news)
- Android local LLM roundup and AnythingLLM Mobile review: https://www.promptquorum.com
- Gemini Nano 4 devices: https://www.ninetwothree.co/blog/gemini-nano-4-device-support
- Gemini Nano features: https://androidauthority.com/gemini-nano-features-devices-3490062
- EndeavorRx: https://www.biospace.com/article/fda-approves-akili-s-therapeutic-video-game-for-adhd/ ; https://www.mobihealthnews.com/news/endeavorrx-akilis-video-game-therapeutic-receives-fda-de-novo-clearance
- one sec study: https://pmc.ncbi.nlm.nih.gov/articles/PMC9974409 ; https://fortune.com/well/2023/03/06/one-sec-app-can-help-cut-your-social-media-use
- one sec RCT registration: https://www.socialscienceregistry.org/trials/15364
