// Device-calendar reads are optional. Permission is requested only when the
// user invokes a calendar feature; the app reads a bounded window and returns
// only the event fields needed for preparation.

import * as Calendar from "expo-calendar";
import type { ToolCallResult, Language } from "../orchestrator/types";
import { isValidYMD } from "../orchestrator/date-utils";

export interface UpcomingCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

async function hasCalendarPermission(): Promise<boolean> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const requested = await Calendar.requestCalendarPermissionsAsync();
  return requested.granted;
}

export async function getUpcomingCalendarEvents(
  lookAheadDays = 30,
  limit = 12,
): Promise<
  | { success: true; events: UpcomingCalendarEvent[] }
  | { success: false; message: string }
> {
  if (!Number.isInteger(lookAheadDays) || lookAheadDays < 1 || lookAheadDays > 90) {
    return { success: false, message: "Choose a calendar window between 1 and 90 days." };
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return { success: false, message: "The appointment list limit is invalid." };
  }

  try {
    if (!(await hasCalendarPermission())) {
      return { success: false, message: "Calendar access wasn’t granted. You can still use Beginora without it." };
    }
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((calendar) => calendar.id);
    if (calendarIds.length === 0) return { success: true, events: [] };

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + lookAheadDays);
    const events = await Calendar.getEventsAsync(calendarIds, start, end);
    const seen = new Set<string>();
    const upcoming = events
      .map((event) => {
        const eventStart = new Date(event.startDate);
        const eventEnd = new Date(event.endDate);
        return {
          id: event.id || `${event.calendarId}:${eventStart.toISOString()}`,
          title: event.title?.trim() || "Calendar event",
          start: eventStart.toISOString(),
          end: eventEnd.toISOString(),
          allDay: event.allDay ?? false,
          location: event.location?.trim() || undefined,
        } satisfies UpcomingCalendarEvent;
      })
      .filter((event) => {
        const at = new Date(event.start).getTime();
        if (!Number.isFinite(at) || at < start.getTime() || at > end.getTime()) return false;
        const duplicateKey = `${event.title.trim().toLocaleLowerCase()}|${event.start}|${event.end}`;
        if (seen.has(duplicateKey)) return false;
        seen.add(duplicateKey);
        return true;
      })
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, limit);

    return { success: true, events: upcoming };
  } catch {
    return { success: false, message: "I couldn’t read your calendar just now. You can add a task manually instead." };
  }
}

export async function getNextCalendarEvent(): Promise<
  | { success: true; event: UpcomingCalendarEvent | null }
  | { success: false; message: string }
> {
  const result = await getUpcomingCalendarEvents(30, 1);
  if (!result.success) return result;
  return { success: true, event: result.events[0] ?? null };
}

// Reads events for one local day for the chat assistant. Event data is returned
// to the local orchestration layer only; nothing is synced by this adapter.
export async function getCalendarEvents(
  date: string,
  lang: Language,
): Promise<ToolCallResult> {
  if (!isValidYMD(date)) {
    return {
      success: false,
      message: lang === "it" ? "Data non valida." : "Invalid date.",
      error: `Expected YYYY-MM-DD, got "${date}"`,
    };
  }

  if (!(await hasCalendarPermission())) {
    return {
      success: false,
      message: lang === "it"
        ? "Mi servono i permessi per accedere al calendario."
        : "I need permission to read your calendar.",
    };
  }

  try {
    const [year, month, day] = date.split("-").map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const ids = calendars.map((calendar) => calendar.id);
    if (ids.length === 0) {
      return { success: true, message: "No calendars found", data: JSON.stringify([]) };
    }

    const events = await Calendar.getEventsAsync(ids, start, end);
    const shaped = events
      .map((event) => ({
        title: event.title ?? "(no title)",
        start: event.startDate,
        end: event.endDate,
        location: event.location || undefined,
        allDay: event.allDay || undefined,
      }))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));

    return {
      success: true,
      message: `${shaped.length} event(s) on ${date}`,
      data: JSON.stringify(shaped),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: lang === "it" ? "Lettura calendario non riuscita." : "Failed to read the calendar.",
      error: message,
    };
  }
}
