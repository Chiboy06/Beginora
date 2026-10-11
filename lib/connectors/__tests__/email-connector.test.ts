import { validateEmailDraft, type EmailDraft } from "../email-connector";

const validDraft: EmailDraft = {
  recipients: ["person@example.com"],
  subject: "Appointment follow-up",
  body: "Hello, could we confirm the appointment time?",
};

describe("email draft connector", () => {
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
});
