import { MMKV } from "react-native-mmkv";

// Single MMKV instance for all UI/session prefs.
// Synchronous reads make this ideal for settings that gate rendering.
export const storage = new MMKV({ id: "beginora-prefs" });

export const prefs = {
  get language(): "en" | "it" {
    return (storage.getString("language") as "en" | "it") ?? "en";
  },
  set language(v: "en" | "it") {
    storage.set("language", v);
  },

  get confirmDestructive(): boolean {
    return storage.getBoolean("confirm_destructive_actions") ?? true;
  },
  set confirmDestructive(v: boolean) {
    storage.set("confirm_destructive_actions", v);
  },

  get cloudSyncEnabled(): boolean {
    return storage.getBoolean("cloud_sync_enabled") ?? false;
  },
  set cloudSyncEnabled(v: boolean) {
    storage.set("cloud_sync_enabled", v);
  },

  get onboardingDone(): boolean {
    return storage.getBoolean("onboarding_done") ?? false;
  },
  set onboardingDone(v: boolean) {
    storage.set("onboarding_done", v);
  },

  // Set while the startup model load runs. Still set on the next launch means
  // that load crashed or hung the app, so it must not be retried automatically.
  get pendingModelLoad(): string | undefined {
    return storage.getString("pending_model_load");
  },
  set pendingModelLoad(v: string | undefined) {
    if (v) storage.set("pending_model_load", v);
    else storage.delete("pending_model_load");
  },

  // What Beginora calls the user; one short line, used in greetings and the prompt.
  get userName(): string {
    return storage.getString("user_name") ?? "";
  },
  set userName(v: string) {
    const name = v.replace(/\s+/g, " ").trim().slice(0, 40);
    if (name) storage.set("user_name", name);
    else storage.delete("user_name");
  },

  // Opt-in gentle check-in notifications (background scan). Off by default.
  get checkInsEnabled(): boolean {
    return storage.getBoolean("check_ins_enabled") ?? false;
  },
  set checkInsEnabled(v: boolean) {
    storage.set("check_ins_enabled", v);
  },

  // When each task was last nudged, as JSON { taskId: ms }.
  get checkInLog(): Record<string, number> {
    try {
      return JSON.parse(storage.getString("check_in_log") ?? "{}");
    } catch {
      return {};
    }
  },
  set checkInLog(v: Record<string, number>) {
    storage.set("check_in_log", JSON.stringify(v));
  },

  // Opt-in screen-pattern signals from Usage access. Off by default.
  get usageSignalsEnabled(): boolean {
    return storage.getBoolean("usage_signals_enabled") ?? false;
  },
  set usageSignalsEnabled(v: boolean) {
    storage.set("usage_signals_enabled", v);
  },

  // Reply to Telegram messages (two-way bot). Off by default.
  get telegramTwoWay(): boolean {
    return storage.getBoolean("telegram_two_way") ?? false;
  },
  set telegramTwoWay(v: boolean) {
    storage.set("telegram_two_way", v);
  },

  // Next Telegram update_id to fetch; confirms everything before it.
  get telegramOffset(): number {
    return storage.getNumber("telegram_update_offset") ?? 0;
  },
  set telegramOffset(v: number) {
    storage.set("telegram_update_offset", v);
  },

  get keepModelInBackground(): boolean {
    return storage.getBoolean("keep_model_in_background") ?? false;
  },
  set keepModelInBackground(v: boolean) {
    storage.set("keep_model_in_background", v);
  },
};
