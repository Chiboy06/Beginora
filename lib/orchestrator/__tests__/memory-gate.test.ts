import { shouldExtractMemory } from "../memory-gate";

describe("shouldExtractMemory", () => {
  it("skips tool-call turns (canned confirmations)", () => {
    expect(shouldExtractMemory("set an alarm for 7:30 tomorrow morning", true)).toBe(false);
  });

  it("skips short greetings / acks", () => {
    expect(shouldExtractMemory("ok", false)).toBe(false);
    expect(shouldExtractMemory("grazie", false)).toBe(false);
    expect(shouldExtractMemory("   ciao   ", false)).toBe(false);
  });

  it("runs on substantive chat turns", () => {
    expect(shouldExtractMemory("I'm vegetarian and I work night shifts", false)).toBe(true);
    expect(shouldExtractMemory("Mio figlio si chiama Marco", false)).toBe(true);
  });
});

describe("echoesText", () => {
  const { echoesText } = jest.requireActual("../memory-gate");
  const prompt = "Do not use clinical language and do not add pressure.";

  it("catches a memory copied from the system prompt", () => {
    expect(echoesText("User wants us to not use clinical language", prompt)).toBe(true);
  });

  it("keeps a real fact", () => {
    expect(echoesText("Works night shifts at a hospital", prompt)).toBe(false);
  });
});

describe("asksAboutUser", () => {
  const { asksAboutUser } = jest.requireActual("../memory-gate");

  it.each(["what do you know about me", "remember my sister's name?", "help me start my essay", "cosa ricordi di me"])("yes: %s", (q) => {
    expect(asksAboutUser(q)).toBe(true);
  });

  it.each(["how many states are in Nigeria?", "what is the capital of France"])("no: %s", (q) => {
    expect(asksAboutUser(q)).toBe(false);
  });
});
