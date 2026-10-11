# Decisions

Autonomous decisions made during the Beginora build. Recorded per the build document instructions.
Format: decision, rationale, reversibility, date.

---

## D-001 — Base repo: RisorseArtificiali/vesta

**Decision:** Fork vesta (MIT, Expo SDK 55 / RN 0.83.2) as the Beginora base rather than starting from scratch.

**Rationale:** Vesta provides a production-quality offline AI assistant with proven KV-cache architecture, llama.rn inference, SQLite storage, Zustand state, and full Android native modules. Reusing it avoids rebuilding ~135 files of tested infrastructure.

**Reversibility:** High — the fork is a copy, not a submodule. Any file can be replaced.

**Date:** 2026-10-11

---

## D-002 — React Native version: 0.83.2 (not 0.88)

**Decision:** Stay on RN 0.83.2 (the vesta base) rather than upgrading to 0.88.

**Rationale:** Reanimated 3.x requires RN ~0.83 or ~0.74. Upgrading to 0.88 would require Reanimated 4.x, which is a breaking change. The hackathon deadline does not allow a major RN upgrade.

**Reversibility:** Medium — requires Reanimated and MMKV version bumps.

**Date:** 2026-10-11

---

## D-003 — Expo SDK: 55 (not 58)

**Decision:** Stay on Expo SDK 55 (the vesta base) rather than upgrading to SDK 58.

**Rationale:** SDK 58 is in beta. The vesta base is tested on SDK 55. Upgrading mid-hackathon introduces unquantified risk.

**Reversibility:** Medium — standard Expo upgrade path.

**Date:** 2026-10-11

---

## D-004 — Package manager: npm with --legacy-peer-deps

**Decision:** Use npm with `--legacy-peer-deps` for all installs.

**Rationale:** The Expo SDK 55 ecosystem has peer dependency conflicts between packages that are resolved by the Expo team but not yet reflected in npm's strict peer resolution. This is the standard Expo workaround.

**Reversibility:** High — remove the flag when peer deps are resolved upstream.

**Date:** 2026-10-11

---

## D-005 — Audit policy: accept 27 high + 30 moderate transitive advisories

**Decision:** Accept the existing audit findings as documented in docs/SECURITY_AUDIT.md.

**Rationale:** All 57 findings trace to two upstream advisories in transitive dependencies locked by the Expo SDK. They cannot be resolved without breaking the Expo SDK version constraint. The app has no server-side attack surface; the risk is limited to the local device.

**Reversibility:** High — re-run `npm audit fix` after an Expo SDK upgrade resolves the upstream deps.

**Date:** 2026-10-11

---

## D-006 — Cloud sync: off for this build

**Decision:** `ENABLE_CLOUD_SYNC=false` is hardcoded in all EAS build profiles. Cognito and API_URL are not bundled.

**Rationale:** No sync backend exists. Bundling cloud credentials without a backend would be misleading and a security risk. The sync queue and sync service are implemented but dormant.

**Reversibility:** High — set `ENABLE_CLOUD_SYNC=true` and provide `API_URL` in the build environment when a backend is ready.

**Date:** 2026-10-11

---

## D-007 — MCP server: hidden in release builds

**Decision:** The MCP server screen is registered in the navigator but not linked from any visible UI in release builds.

**Rationale:** The MCP server is a developer feature. Exposing it in a release build would require a Play Console special-use declaration and increases the attack surface.

**Reversibility:** High — add a tab or settings link to re-expose it.

**Date:** 2026-10-11

---

## D-008 — Safety pre-check: deterministic keyword list

**Decision:** The safety pre-check in `lib/ai/decomposer.ts` uses a small, conservative regex list rather than a secondary model.

**Rationale:** A secondary model adds RAM pressure and latency. The keyword list is fast, deterministic, and auditable. False positives fall back to the rule engine, which is safe. The response text is fixed and human-reviewed.

**Reversibility:** High — replace with a model-based classifier when RAM budget allows.

**Date:** 2026-10-11

---

## D-009 — Onboarding gate: MMKV flag checked at root layout

**Decision:** `prefs.onboardingDone` is checked in `app/_layout.tsx` after init. First-run users are redirected to `/onboarding` before the tab navigator loads.

**Rationale:** The disclaimer is required by the build document (WP-5) and the product definition. Gating at the root layout ensures it cannot be bypassed by deep links.

**Reversibility:** High — remove the gate or reset the flag in settings.

**Date:** 2026-10-11

---

## D-010 — Reminder: one per task, 15-minute default

**Decision:** Each task can have at most one scheduled reminder. The default delay is 15 minutes from the time the user requests it.

**Rationale:** Multiple reminders per task would require a more complex scheduling UI and increase notification fatigue. The build document specifies "optional one-per-task reminder".

**Reversibility:** High — extend the reminder model to support multiple reminders per task.

**Date:** 2026-10-11

---

## D-011 — EAS project ID: placeholder for hackathon build

**Decision:** `EAS_PROJECT_ID` is left as a placeholder in `app.config.ts`. OTA updates are disabled until a real project is linked.

**Rationale:** Linking an EAS project requires an Expo account and a project created on expo.dev. This is a post-submission step. The app is fully functional without it.

**Reversibility:** High — replace the placeholder with the real project ID and set `EAS_UPDATES_ENABLED=true`.

**Date:** 2026-10-11

---

## Known risks (from build document §11)

- RN 0.83 and Expo SDK 55 are not the latest stable versions. Monitor for security patches.
- Hermes and Reanimated memory behaviour on low-RAM phones is not fully characterised.
- Model latency on mid-range phones: evaluate the 1.7B model if the 4B model is slow.
- Reminder reliability varies by phone brand and battery optimisation settings.
- The hackathon APK is debug-signed and is for testing only, not Play Store distribution.
- Challenge deadline discrepancy: 14 October 2026 03:45 UTC on the rules page vs 21 October on the schedule page. Verify on the dashboard before submission.
