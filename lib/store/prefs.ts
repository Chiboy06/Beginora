import { MMKV } from "react-native-mmkv";

// Single MMKV instance for all UI/session prefs.
// Synchronous reads make this ideal for settings that gate rendering.
export const storage = new MMKV({ id: "beginora-prefs" });

export interface ReminderLogEntry {
  id: string;
  text: string;
  at: number;
  createdAt: number;
  cancelled: boolean;
}

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

  // Reminders the user set (newest first, at most 50), for the Reminders list.
  get reminderLog(): ReminderLogEntry[] {
    try {
      const parsed = JSON.parse(storage.getString("reminder_log") ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  set reminderLog(v: ReminderLogEntry[]) {
    storage.set("reminder_log", JSON.stringify(v));
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

  // Last time Today was opened; a long gap shows "Welcome back".
  get lastOpenedAt(): number {
    return storage.getNumber("last_opened_at") ?? 0;
  },
  set lastOpenedAt(v: number) {
    storage.set("last_opened_at", v);
  },

  // "system", "light" or "dark"; read by lib/theme.ts at start-up.
  get appearance(): "system" | "light" | "dark" {
    const v = storage.getString("appearance");
    return v === "light" || v === "dark" ? v : "system";
  },
  set appearance(v: "system" | "light" | "dark") {
    storage.set("appearance", v);
  },

  // Quiet hours for check-ins (hours 0-23). Reminders you set still ring.
  get quietHours(): { enabled: boolean; start: number; end: number } {
    return {
      enabled: storage.getBoolean("quiet_enabled") ?? false,
      start: storage.getNumber("quiet_start") ?? 22,
      end: storage.getNumber("quiet_end") ?? 7,
    };
  },
  set quietHours(v: { enabled: boolean; start: number; end: number }) {
    storage.set("quiet_enabled", v.enabled);
    storage.set("quiet_start", v.start);
    storage.set("quiet_end", v.end);
  },

  // Lock screen shows "You have a reminder" instead of the reminder text.
  get hideReminderText(): boolean {
    return storage.getBoolean("hide_reminder_text") ?? false;
  },
  set hideReminderText(v: boolean) {
    storage.set("hide_reminder_text", v);
  },

  // Online model: "off", "fallback" (no model or a tiny one) or "always".
  get onlineMode(): "off" | "fallback" | "always" {
    const v = storage.getString("online_mode");
    return v === "fallback" || v === "always" ? v : "off";
  },
  set onlineMode(v: "off" | "fallback" | "always") {
    storage.set("online_mode", v);
  },
  get onlineBaseUrl(): string {
    return storage.getString("online_base_url") ?? "";
  },
  set onlineBaseUrl(v: string) {
    storage.set("online_base_url", v.trim());
  },
  get onlineModel(): string {
    return storage.getString("online_model") ?? "";
  },
  set onlineModel(v: string) {
    storage.set("online_model", v.trim());
  },
  // Send memories and documents with online questions. Off by default.
  get onlineSendMemories(): boolean {
    return storage.getBoolean("online_send_memories") ?? false;
  },
  set onlineSendMemories(v: boolean) {
    storage.set("online_send_memories", v);
  },

  // Linked to the shared Beginora Telegram bot through the relay.
  get telegramRelayLinked(): boolean {
    return storage.getBoolean("telegram_relay_linked") ?? false;
  },
  set telegramRelayLinked(v: boolean) {
    storage.set("telegram_relay_linked", v);
  },

  // Weekly planning: the user's goals in their own words, and their projects.
  get goalsText(): string {
    return storage.getString("goals_text") ?? "";
  },
  set goalsText(v: string) {
    storage.set("goals_text", v.slice(0, 4000));
  },
  get projects(): string[] {
    try {
      const parsed = JSON.parse(storage.getString("projects") ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
    } catch {
      return [];
    }
  },
  set projects(v: string[]) {
    const clean = [...new Set(v.map((p) => p.replace(/\s+/g, " ").trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
    storage.set("projects", JSON.stringify(clean));
  },

  // The planning guide saved after the goals; empty means the default guide.
  get planningGuide(): string {
    return storage.getString("planning_guide") ?? "";
  },
  set planningGuide(v: string) {
    storage.set("planning_guide", v.slice(0, 2000));
  },

  // The weekly-plan check-in: "What's your plan for the week?" Off by default.
  // weekday: 1 = Sunday ... 7 = Saturday (expo-notifications); 2 = Monday.
  get weeklyCheckIn(): { enabled: boolean; hour: number; weekday: number } {
    return {
      enabled: storage.getBoolean("weekly_checkin") ?? false,
      hour: storage.getNumber("weekly_checkin_hour") ?? 9,
      weekday: storage.getNumber("weekly_checkin_weekday") ?? 2,
    };
  },
  set weeklyCheckIn(v: { enabled: boolean; hour: number; weekday: number }) {
    storage.set("weekly_checkin", v.enabled);
    storage.set("weekly_checkin_hour", v.hour);
    storage.set("weekly_checkin_weekday", v.weekday);
  },
  get weeklyCheckInId(): string | undefined {
    return storage.getString("weekly_checkin_id");
  },
  set weeklyCheckInId(v: string | undefined) {
    if (v) storage.set("weekly_checkin_id", v);
    else storage.delete("weekly_checkin_id");
  },

  // Daily "How was your day?" notification. Off by default.
  get moodCheckIn(): { enabled: boolean; hour: number; minute: number } {
    return {
      enabled: storage.getBoolean("mood_checkin") ?? false,
      hour: storage.getNumber("mood_checkin_hour") ?? 20,
      minute: storage.getNumber("mood_checkin_minute") ?? 0,
    };
  },
  set moodCheckIn(v: { enabled: boolean; hour: number; minute: number }) {
    storage.set("mood_checkin", v.enabled);
    storage.set("mood_checkin_hour", v.hour);
    storage.set("mood_checkin_minute", v.minute);
  },
  get moodCheckInId(): string | undefined {
    return storage.getString("mood_checkin_id");
  },
  set moodCheckInId(v: string | undefined) {
    if (v) storage.set("mood_checkin_id", v);
    else storage.delete("mood_checkin_id");
  },
};
