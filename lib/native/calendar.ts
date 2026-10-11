// Calendar read access via expo-calendar. Permission is requested only when a
// user explicitly invokes a calendar feature.

import * as Calendar from "expo-calendar";
import type { ToolCallResult, Language } from "../orchestrator/types";
import { isValidYMD } from "../orchestrator/date-utils";

export interface UpcomingCalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

async function hasCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

export async function getNextCalendarEvent(): Promise<
  | { success: true; event: UpcomingCalendarEvent | null }
  | { success: false; message: string }
> {
  if (!(await hasCalendarPermission())) {
    return { success: false, message: "Calendar access wasn’t granted. You can add a task manually instead." };
  }

  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((calendar) => calendar.id);
    if (calendarIds.length === 0) return { success: true, event: null };

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    const events = await Calendar.getEventsAsync(calendarIds, start, end);
    const next = events
      .filter((event) => new Date(event.startDate).getTime() >= start.getTime())
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];

    if (!next) return { success: true, event: null };
    return {
      success: true,
      event: {
        title: next.title?.trim() || "Calendar event",
        start: new Date(next.startDate).toISOString(),
        end: new Date(next.endDate).toISOString(),
        allDay: next.allDay ?? false,
      },
    };
  } catch {
    return { success: false, message: "I couldn’t read the calendar just now. You can add a task manually instead." };
  }
}

// Reads events for a single local day (YYYY-MM-DD) for the chat assistant.
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
