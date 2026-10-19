// Phone call / SMS launchers. Resolves a contact name (or raw number) to a
// number, then opens the dialer / messaging app via RN Linking. Opening the
// dialer (not auto-calling) needs no CALL_PHONE permission and keeps the user
// in control — they place the call / send the message themselves.

import { Linking, Share } from "react-native";
import type { ToolCallResult, Language } from "../orchestrator/types";
import { resolveContactNumber, type ResolveResult } from "./contacts";
import { scheduleLocalReminder } from "./reminders";

// Opens the messaging app with the recipient and text filled in; the user sends.
export function smsUrl(number: string, text: string): string {
  return `sms:${number}?body=${encodeURIComponent(text)}`;
}

// Localized message for a contact that couldn't be resolved — distinguishing a
// missing permission from a genuine no-match (don't claim the contact is absent
// when we simply weren't allowed to look).
function unresolvedResult(
  failure: Extract<ResolveResult, { ok: false }>,
  contact: string,
  lang: Language,
): ToolCallResult {
  if (failure.reason === "permission") {
    return {
      success: false,
      message:
        lang === "it"
          ? "Mi servono i permessi per accedere ai contatti."
          : "I need permission to access your contacts.",
      error: "permission denied",
    };
  }
  return {
    success: false,
    message:
      lang === "it"
        ? `Non ho trovato un numero per "${contact}".`
        : `Couldn't find a number for "${contact}".`,
    error: "no matching contact",
  };
}

export async function makeCall(
  contact: string,
  lang: Language,
): Promise<ToolCallResult> {
  const resolved = await resolveContactNumber(contact);
  if (!resolved.ok) return unresolvedResult(resolved, contact, lang);

  try {
    await Linking.openURL(`tel:${resolved.number}`);
    return {
      success: true,
      message: lang === "it" ? `Chiamo ${resolved.name}` : `Calling ${resolved.name}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: lang === "it" ? "Chiamata non riuscita." : "Failed to start call.",
      error: msg,
    };
  }
}

export async function sendSms(
  contact: string,
  text: string,
  lang: Language,
): Promise<ToolCallResult> {
  const resolved = await resolveContactNumber(contact);
  if (!resolved.ok) return unresolvedResult(resolved, contact, lang);

  // sms:<number>?body=<text> opens the messaging app with the message
  // pre-filled; the user taps send.
  const url = smsUrl(resolved.number, text ?? "");
  try {
    await Linking.openURL(url);
    return {
      success: true,
      message:
        lang === "it"
          ? `Messaggio per ${resolved.name} pronto da inviare`
          : `Message to ${resolved.name} ready to send`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message:
        lang === "it"
          ? "Impossibile aprire l'app messaggi."
          : "Failed to open the messaging app.",
      error: msg,
    };
  }
}

// Android only lets the default SMS app send texts unattended, so a scheduled
// text is a notification that opens the ready-written message at that time.
export async function scheduleSms(
  contact: string,
  text: string,
  datetime: string,
  lang: Language,
): Promise<ToolCallResult> {
  const resolved = await resolveContactNumber(contact);
  if (!resolved.ok) return unresolvedResult(resolved, contact, lang);

  const scheduled = await scheduleLocalReminder(
    lang === "it"
      ? `Messaggio per ${resolved.name}: "${text}". Tocca per aprirlo e inviarlo.`
      : `Text ${resolved.name}: "${text}". Tap to open it and send.`,
    datetime,
    null,
    { kind: "sms", to: resolved.number, body: text },
  );
  if (!scheduled.success) return { success: false, message: scheduled.message, error: "not scheduled" };
  const when = new Date(datetime).toLocaleString(lang === "it" ? "it-IT" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  return {
    success: true,
    message:
      lang === "it"
        ? `Alle ${when} ti ricorderò di scrivere a ${resolved.name}, con il messaggio pronto.`
        : `At ${when} I'll remind you to text ${resolved.name}, with the message ready to send.`,
  };
}

// Notes apps have no shared API, but every one accepts text from the share sheet.
export async function saveNote(text: string, lang: Language): Promise<ToolCallResult> {
  try {
    const result = await Share.share({ message: text });
    const shared = result.action === Share.sharedAction;
    return {
      success: shared,
      message: shared
        ? lang === "it" ? "Nota condivisa." : "Note shared."
        : lang === "it" ? "Nessuna nota salvata." : "No note was saved.",
    };
  } catch (err) {
    return {
      success: false,
      message: lang === "it" ? "Non riesco ad aprire il menu Condividi." : "Couldn't open the share menu.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
