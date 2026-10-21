// Tool Dispatcher — routes parsed tool calls to native module actions.
// Beginora adds break_down_task as the primary tool for executive-function support.

import type { ToolCallResult, Language } from "./types";
import { MVP_TOOLS } from "../tools/tool-registry";
import { setAlarm, createEvent, setTimer, navigateTo } from "../native/system-actions";
import { scheduleLocalReminder, scheduleReminder } from "../native/reminders";
import { searchContacts } from "../native/contacts";
import { makeCall, saveNote, scheduleSms, sendSms } from "../native/communication";
import { getCalendarEvents } from "../native/calendar";
import { queryDocuments } from "./document-retriever";
import { isValidYMD } from "./date-utils";
import { decompose } from "../ai/decomposer";
import { openEmailDraft } from "../connectors/email-connector";
import { useTaskStore } from "../store/task-store";
import { getAppEvents, hasUsageAccess } from "../native/usage-access";
import { screenTime } from "../focus/usage-signals";
import { sendTelegramMessage } from "../telegram/telegram-service";
import { formatPlan } from "../ai/format-plan";

const FORMAT_VALIDATORS: Record<string, (value: string) => string | null> = {
  "HH:MM": (v) => {
    if (!/^\d{1,2}:\d{2}$/.test(v)) return `Expected HH:MM, got "${v}"`;
    const [h, m] = v.split(":").map(Number);
    if (h < 0 || h > 23) return `Hours must be 0-23, got ${h}`;
    if (m < 0 || m > 59) return `Minutes must be 0-59, got ${m}`;
    return null;
  },
  "YYYY-MM-DD": (v) => {
    // Strict: rejects impossible days like 2026-02-30 (new Date() would roll over).
    if (!isValidYMD(v)) return `Expected a valid YYYY-MM-DD date, got "${v}"`;
    return null;
  },
  ISO8601: (v) => {
    // Accept common ISO 8601 variants: with/without seconds, with/without timezone
    const d = new Date(v);
    if (isNaN(d.getTime())) return `Invalid ISO 8601 datetime: "${v}"`;
    return null;
  },
};

// Models sometimes emit a full ISO datetime where a bare date is expected —
// e.g. get_calendar_events date: "2026-07-02T00:00:00", following the prompt's
// general "YYYY-MM-DDTHH:MM:SS" date-format rule instead of the tool schema.
// The datetime carries strictly more information than the parameter needs, so
// truncate to the date part rather than reject the whole call. Exported for
// unit tests.
export function normalizeToolParams(
  tool: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const def = MVP_TOOLS.find((t) => t.name === tool);
  if (!def) return params;
  const out = { ...params };
  for (const [key, prop] of Object.entries(def.parameters.properties)) {
    const value = out[key];
    if (
      prop.format === "YYYY-MM-DD" &&
      typeof value === "string" &&
      value.length > 10 &&
      value[10] === "T" &&
      isValidYMD(value.slice(0, 10))
    ) {
      out[key] = value.slice(0, 10);
    }
    // Small models append the prompt's zone label ("...T15:00 (Africa/Lagos)"),
    // which no date parser accepts; keep the local date and time.
    if (prop.format === "ISO8601" && typeof value === "string") {
      const m = LOCAL_DATETIME.exec(value);
      if (m) out[key] = `${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:${m[4] ?? "00"}`;
    }
    // An alarm time given as a full datetime: keep HH:MM and fill the date.
    if (prop.format === "HH:MM" && typeof value === "string") {
      const m = LOCAL_DATETIME.exec(value);
      if (m) {
        out[key] = `${m[2].padStart(2, "0")}:${m[3]}`;
        if (def.parameters.properties.date && out.date === undefined) out.date = m[1];
      }
    }
  }
  if (tool === "create_event" && typeof out.title === "string") {
    // "Add I am Batman to my calendar" -> "I am Batman"
    out.title = out.title
      .replace(/^(please\s+)?(add|put|create|schedule|book)\s+/i, "")
      .replace(/\s+(to|on|in|into)\s+my\s+(calendar|schedule|agenda)\b.*$/i, "")
      .trim() || out.title;
  }
  return out;
}

const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/;

// Normalizes, then validates, without running anything: lets the orchestrator
// refuse a call before asking the user to confirm an action that would fail.
export function checkToolParams(
  tool: string,
  rawParameters: Record<string, unknown>,
): { parameters: Record<string, unknown>; error: string | null } {
  const parameters = normalizeToolParams(tool, rawParameters);
  return { parameters, error: validateParams(tool, parameters) };
}

function validateParams(
  tool: string,
  params: Record<string, unknown>,
): string | null {
  const def = MVP_TOOLS.find((t) => t.name === tool);
  if (!def) return `Unknown tool: ${tool}`;

  // Validate required params exist and have correct type
  for (const req of def.parameters.required) {
    if (params[req] === undefined || params[req] === null) {
      return `Missing required parameter: ${req}`;
    }
    const prop = def.parameters.properties[req];
    if (prop?.type === "string" && typeof params[req] !== "string") {
      return `Parameter "${req}" must be a string, got ${typeof params[req]}`;
    }
    if (prop?.type === "number" && typeof params[req] !== "number") {
      return `Parameter "${req}" must be a number, got ${typeof params[req]}`;
    }
  }

  // Validate format constraints on all provided string params
  for (const [key, prop] of Object.entries(def.parameters.properties)) {
    const value = params[key];
    if (value === undefined || value === null || typeof value !== "string") continue;
    if (prop.format && FORMAT_VALIDATORS[prop.format]) {
      const formatError = FORMAT_VALIDATORS[prop.format](value);
      if (formatError) return `Parameter "${key}": ${formatError}`;
    }
  }

  return null;
}

export async function dispatchToolCall(
  tool: string,
  rawParameters: Record<string, unknown>,
  lang: Language = "en",
): Promise<ToolCallResult> {
  const parameters = normalizeToolParams(tool, rawParameters);
  const validationError = validateParams(tool, parameters);
  if (validationError) {
    return { success: false, message: "Invalid parameters", error: validationError };
  }

  try {
    switch (tool) {
      case "break_down_task": {
        // The planner runs the safety pre-check, validates any model output and
        // falls back to the rule engine; its plan is the reply the user sees.
        const plan = await decompose(String(parameters.task ?? ""));
        return { success: true, message: formatPlan(plan) };
      }

      case "set_alarm":
        return await setAlarm(
          parameters.time as string,
          parameters.date as string | undefined,
          parameters.label as string | undefined,
        );

      case "create_event":
        return await createEvent(
          parameters.title as string,
          parameters.start as string,
          parameters.end as string | undefined,
          parameters.location as string | undefined,
        );

      case "set_reminder":
        // Schedules a real local notification (offline), not a calendar insert.
        return await scheduleReminder(
          parameters.text as string,
          parameters.datetime as string,
        );

      case "set_timer":
        return await setTimer(
          parameters.minutes as number,
          parameters.label as string | undefined,
        );

      case "navigate_to":
        return await navigateTo(parameters.destination as string);

      case "search_contacts":
        return await searchContacts(parameters.query as string, lang);

      case "make_call":
        return await makeCall(parameters.contact as string, lang);

      case "send_sms":
        return await sendSms(
          parameters.contact as string,
          parameters.text as string,
          lang,
        );

      case "get_screen_time": {
        if (!(await hasUsageAccess())) {
          return {
            success: false,
            message: lang === "it"
              ? "Per vedere il tempo nelle app, consenti l'accesso all'utilizzo in Impostazioni > Permessi."
              : "To see your screen time, allow usage access in Settings > Permissions and connections.",
          };
        }
        const now = Date.now();
        const midnight = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
        const top = screenTime(await getAppEvents(midnight), midnight, now).slice(0, 5);
        const total = top.reduce((n, a) => n + a.minutes, 0);
        const message = top.length === 0
          ? (lang === "it" ? "Nessun uso registrato oggi." : "No app use recorded today.")
          : (lang === "it" ? `Oggi, app principali (${total} min):` : `Today, top apps (${total} min):`);
        return { success: true, message, data: JSON.stringify(top.map((a) => ({ title: `${a.app}: ${a.minutes} min` }))) };
      }

      case "add_task": {
        // Saved with a first step from the planner (rule engine without a model).
        const title = String(parameters.title).trim();
        const plan = await decompose(title);
        if (plan.source === "safety_block") return { success: true, message: plan.firstAction };
        const task = await useTaskStore.getState().createTaskWithPlan(title, plan.firstAction, plan.steps);
        let reminderNote = "";
        if (typeof parameters.remindAt === "string") {
          // The time is also the task's due time, so it shows on that day in Plan.
          const dueAt = new Date(parameters.remindAt).getTime();
          if (!Number.isNaN(dueAt)) {
            await useTaskStore.getState().updateDetails(task.id, { title, steps: plan.steps, dueAt, remind: false });
          }
          // A task with a time also notifies at that time, and the notification opens the task.
          const reminder = await scheduleLocalReminder(
            `${title}: ${plan.firstAction}`,
            parameters.remindAt,
            null,
            { kind: "task", taskId: task.id },
          );
          if (reminder.success && reminder.identifier) {
            await useTaskStore.getState().setReminderId(task.id, reminder.identifier);
            const at = new Date(parameters.remindAt).toLocaleString(lang === "it" ? "it-IT" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
            reminderNote = lang === "it" ? ` Ti ricorderò ${at}.` : ` I'll remind you ${at}.`;
          } else {
            reminderNote = ` ${reminder.message}`;
          }
        }
        return {
          success: true,
          message: (lang === "it" ? `Salvato "${title}".` : `Saved "${title}".`) + reminderNote + ` ${formatPlan(plan)}`,
        };
      }

      case "draft_email": {
        const to = typeof parameters.to === "string" ? parameters.to.trim() : "";
        const result = await openEmailDraft({
          recipients: to ? [to] : [],
          subject: parameters.subject as string,
          body: parameters.body as string,
        });
        return { success: result.success, message: result.message };
      }

      case "send_telegram": {
        const result = await sendTelegramMessage(parameters.text as string);
        return result.ok
          ? { success: true, message: lang === "it" ? "Inviato su Telegram." : "Sent to your Telegram." }
          : { success: false, message: result.error ?? "Telegram is not set up.", error: result.error };
      }

      case "save_note":
        return await saveNote(parameters.text as string, lang);

      case "schedule_sms":
        return await scheduleSms(
          parameters.contact as string,
          parameters.text as string,
          parameters.datetime as string,
          lang,
        );

      case "get_calendar_events":
        return await getCalendarEvents(parameters.date as string, lang);

      case "query_document":
        return await queryDocuments(parameters.query as string, lang);

      case "general_chat":
        return { success: true, message: "OK" };

      default:
        return {
          success: false,
          message: `Unknown tool: ${tool}`,
          error: `Tool "${tool}" is not registered`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: "Action failed", error: message };
  }
}
