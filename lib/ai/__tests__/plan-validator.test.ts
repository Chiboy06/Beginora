import { validatePlan } from "../plan-validator";

describe("validatePlan", () => {
  it("accepts and trims a well-formed plan while ignoring extra model fields", () => {
    expect(
      validatePlan({
        firstAction: "  Open the document.  ",
        steps: [" Find the file ", " Open it ", " Read the heading "],
        raw: "untrusted extra content",
      }),
    ).toEqual({
      firstAction: "Open the document.",
      steps: ["Find the file", "Open it", "Read the heading"],
    });
  });

  it.each([
    null,
    [],
    "not an object",
    {},
    { firstAction: "", steps: ["a", "b", "c"] },
    { firstAction: "x".repeat(181), steps: ["a", "b", "c"] },
    { firstAction: "Open a file", steps: ["one", "two"] },
    { firstAction: "Open a file", steps: ["one", "two", "three", "four", "five", "six"] },
    { firstAction: "Open a file", steps: ["one", "", "three"] },
    { firstAction: "Open a file", steps: ["one", "two", 3] },
    { firstAction: "Open a file", steps: ["x".repeat(181), "two", "three"] },
  ])("rejects malformed plan payloads", (payload) => {
    expect(validatePlan(payload)).toBeNull();
  });
});
