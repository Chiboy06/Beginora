jest.mock("expo-mail-composer", () => ({
  isAvailableAsync: jest.fn(),
  composeAsync: jest.fn(),
  MailComposerStatus: { UNDETERMINED: "undetermined", SENT: "sent", SAVED: "saved", CANCELLED: "cancelled" },
}));

import * as MailComposer from "expo-mail-composer";
import { openEmailDraft, validateEmailDraft, type EmailDraft } from "../email-connector";

const validDraft: EmailDraft = {
  recipients: ["person@example.com"],
  subject: "Appointment follow-up",
  body: "Hello, could we confirm the appointment time?",
};

describe("email draft connector", () => {
  beforeEach(() => jest.clearAllMocks());

  it("accepts an editable draft with a valid recipient", () => {
    expect(validateEmailDraft(validDraft)).toBeNull();
  });

  it("rejects malformed recipient addresses", () => {
    expect(validateEmailDraft({ ...validDraft, recipients: ["not-an-email"] })).toMatch(/email address/i);
  });

  it("bounds recipient count and draft length", () => {
    expect(validateEmailDraft({ ...validDraft, recipients: Array(11).fill("person@example.com") })).toMatch(/10 recipients/);
    expect(validateEmailDraft({ ...validDraft, subject: "s".repeat(201) })).toMatch(/subject/);
    expect(validateEmailDraft({ ...validDraft, body: "x".repeat(12001) })).toMatch(/message/);
  });

  it("allows a blank recipient so the user can choose an address in their mail app", () => {
    expect(validateEmailDraft({ ...validDraft, recipients: [] })).toBeNull();
  });

  it("does not claim that Beginora sent or saved a draft after the composer returns", async () => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(MailComposer.composeAsync).mockResolvedValue({ status: MailComposer.MailComposerStatus.CANCELLED });

    const result = await openEmailDraft(validDraft);

    expect(result.success).toBe(true);
    expect(result.message).toContain("Check your mail app");
    expect(result.message).toContain("Beginora did not send it directly");
  });

  it("does not open the composer when the device has no available mail app", async () => {
    jest.mocked(MailComposer.isAvailableAsync).mockResolvedValue(false);
    const result = await openEmailDraft(validDraft);
    expect(result.success).toBe(false);
    expect(MailComposer.composeAsync).not.toHaveBeenCalled();
  });
});
