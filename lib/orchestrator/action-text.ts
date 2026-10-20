// What an action will do, written by the app from its parameters. Small models
// often return the prompt's placeholder ("Confirmation message for the user")
// as their message, and this text is shown and read aloud before confirming.

import type { Language } from "./types";

function when(value: unknown, lang: Language): string {
  const d = typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return String(value ?? "");
  return d.toLocaleString(lang === "it" ? "it-IT" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const q = (value: unknown) => `"${String(value ?? "").trim()}"`;

export function describeAction(tool: string, p: Record<string, unknown>, lang: Language): string | null {
  const it = lang === "it";
  switch (tool) {
    case "create_event":
      return it ? `Aggiungo ${q(p.title)} al calendario, ${when(p.start, lang)}?` : `Add ${q(p.title)} to your calendar, ${when(p.start, lang)}?`;
    case "set_reminder":
      return it ? `Ti ricordo ${q(p.text)} ${when(p.datetime, lang)}?` : `Remind you ${q(p.text)} on ${when(p.datetime, lang)}?`;
    case "set_alarm": {
      const day = typeof p.date === "string" ? ` ${when(`${p.date}T12:00`, lang).split(",")[0]}` : "";
      return it ? `Imposto una sveglia alle ${p.time}${day}?` : `Set an alarm for ${p.time}${day}?`;
    }
    case "set_timer":
      return it ? `Timer di ${p.minutes} minuti avviato.` : `Timer set for ${p.minutes} minutes.`;
    case "send_sms":
      if (!String(p.text ?? "").trim()) return it ? `Apro un SMS per ${p.contact}?` : `Open a text to ${p.contact}?`;
      return it ? `Apro un SMS per ${p.contact}: ${q(p.text)}?` : `Open a text to ${p.contact}: ${q(p.text)}?`;
    case "schedule_sms":
      return it
        ? `${when(p.datetime, lang)} ti ricordo di scrivere a ${p.contact}: ${q(p.text)}?`
        : `On ${when(p.datetime, lang)}, remind you to text ${p.contact}: ${q(p.text)}?`;
    case "make_call":
      return it ? `Chiamo ${p.contact}?` : `Call ${p.contact}?`;
    case "send_telegram":
      return it ? `Invio su Telegram: ${q(p.text)}?` : `Send to your Telegram: ${q(p.text)}?`;
    case "draft_email":
      return it ? `Preparo l'email ${q(p.subject)}.` : `Opening an email draft: ${q(p.subject)}.`;
    case "save_note":
      return it ? `Scegli l'app di note per salvare ${q(p.text)}.` : `Choose a notes app to save ${q(p.text)}.`;
    default:
      return null;
  }
}

// Shown when the details could not be understood even after repair.
export function unclearAction(tool: string, lang: Language): string {
  const timeTools = ["create_event", "set_reminder", "set_alarm", "schedule_sms"];
  if (timeTools.includes(tool)) {
    return lang === "it"
      ? "Non ho capito bene l'orario. Prova così: \"alle 18 di oggi\" o \"tra 20 minuti\"."
      : "I didn't catch the time. Try something like \"at 6 pm today\" or \"in 20 minutes\".";
  }
  return lang === "it" ? "Mi manca un dettaglio. Puoi ripeterlo con più precisione?" : "I'm missing a detail. Could you say that again with a bit more detail?";
}
