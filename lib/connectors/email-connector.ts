import * as MailComposer from "expo-mail-composer";

export interface EmailDraft {
  recipients: string[];
  subject: string;
  body: string;
}

export type EmailComposerResult =
  | { success: true; message: string }
  | { success: false; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmailDraft(draft: EmailDraft): string | null {
  if (draft.recipients.length > 10) return "Use no more than 10 recipients.";
  if (draft.recipients.some((address) => address.length > 254 || !EMAIL_RE.test(address.trim()))) {
    return "Check the email address and try again.";
  }
  if (draft.subject.length > 200) return "Keep the subject under 200 characters.";
  if (draft.body.length > 12000) return "Keep the message under 12,000 characters.";
  return null;
}

/** Opens the system composer; the user reviews and sends from their mail app. */
export async function openEmailDraft(draft: EmailDraft): Promise<EmailComposerResult> {
  const validationError = validateEmailDraft(draft);
  if (validationError) return { success: false, message: validationError };

  try {
    if (!(await MailComposer.isAvailableAsync())) {
      return {
        success: false,
        message: "No email app is available on this device. Install or configure one, then try again.",
      };
    }

    await MailComposer.composeAsync({
      recipients: draft.recipients.map((address) => address.trim()),
      subject: draft.subject.trim().slice(0, 200),
      body: draft.body.slice(0, 12000),
    });
    return {
      success: true,
      message: "Your email app opened with an editable draft. Review it there before sending.",
    };
  } catch {
    return {
      success: false,
      message: "I couldn’t open the email app. Your draft remains on this screen; you can try again.",
    };
  }
}
