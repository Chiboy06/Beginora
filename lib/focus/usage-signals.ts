// Screen-pattern signals from Android usage events (Usage access, opt-in).
// Events are read on demand and only these derived numbers are used: nothing
// raw is stored or sent anywhere.

export interface AppEvent {
  packageName: string;
  type: "resumed" | "paused";
  time: number;
}

export interface UsageSummary {
  // How many times the foreground app changed in the switch window.
  switches: number;
  // Minutes spent in distracting apps in the time window.
  distractingMinutes: number;
}

// Common feed and video apps. Matched by package name only; the app never asks
// for the list of installed apps.
export const DISTRACTING_PACKAGES = new Set([
  "com.zhiliaoapp.musically", // TikTok
  "com.ss.android.ugc.trill", // TikTok (some regions)
  "com.instagram.android",
  "com.facebook.katana",
  "com.twitter.android",
  "com.google.android.youtube",
  "com.snapchat.android",
  "com.reddit.frontpage",
  "com.netflix.mediaclient",
]);

export const SWITCH_WINDOW_MS = 10 * 60 * 1000;
export const DISTRACTION_WINDOW_MS = 30 * 60 * 1000;
// shortcut: fixed thresholds, not tuned on real users; adjust after the device test week.
export const DRIFT_SWITCHES = 15;
export const DRIFT_DISTRACTING_MINUTES = 20;

// Foreground sessions: each resumed app runs until the next resume of another
// app, its own pause, or now.
function sessions(events: AppEvent[], now: number): { packageName: string; start: number; end: number }[] {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const result: { packageName: string; start: number; end: number }[] = [];
  let current: { packageName: string; start: number } | null = null;
  for (const event of sorted) {
    if (event.type === "resumed") {
      if (current && current.packageName === event.packageName) continue;
      if (current) result.push({ ...current, end: event.time });
      current = { packageName: event.packageName, start: event.time };
    } else if (current && event.packageName === current.packageName) {
      result.push({ ...current, end: event.time });
      current = null;
    }
  }
  if (current) result.push({ ...current, end: now });
  return result;
}

export function summarizeUsage(events: AppEvent[], now: number, ownPackage: string): UsageSummary {
  const all = sessions(events, now);
  const switchStart = now - SWITCH_WINDOW_MS;
  const distractionStart = now - DISTRACTION_WINDOW_MS;

  let switches = 0;
  let previous: string | null = null;
  for (const s of all) {
    if (s.start >= switchStart && previous !== null && s.packageName !== previous) switches += 1;
    previous = s.packageName;
  }

  let distractingMs = 0;
  for (const s of all) {
    if (s.packageName === ownPackage || !DISTRACTING_PACKAGES.has(s.packageName)) continue;
    distractingMs += Math.max(0, Math.min(s.end, now) - Math.max(s.start, distractionStart));
  }

  return { switches, distractingMinutes: Math.round(distractingMs / 60_000) };
}

export function isDrift(summary: UsageSummary): boolean {
  return summary.switches >= DRIFT_SWITCHES || summary.distractingMinutes >= DRIFT_DISTRACTING_MINUTES;
}
