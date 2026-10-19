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

  get keepModelInBackground(): boolean {
    return storage.getBoolean("keep_model_in_background") ?? false;
  },
  set keepModelInBackground(v: boolean) {
    storage.set("keep_model_in_background", v);
  },
};
