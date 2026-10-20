import { tidyReply } from "../reply-tidy";

test("cuts a reply at the first repeated sentence", () => {
  const looped = "Tomorrow is Wednesday, 21 October. That makes sense. Tomorrow is Wednesday, 21 October. That makes sense.";
  expect(tidyReply(looped)).toBe("Tomorrow is Wednesday, 21 October. That makes sense.");
});

test("keeps plain prose to four sentences", () => {
  expect(tidyReply("One. Two. Three. Four. Five. Six.")).toBe("One. Two. Three. Four.");
});

test("a normal short answer is unchanged", () => {
  expect(tidyReply("Nigeria has 36 states and the Federal Capital Territory, Abuja.")).toBe(
    "Nigeria has 36 states and the Federal Capital Territory, Abuja.",
  );
});

test("lists keep their lines until a line repeats", () => {
  expect(tidyReply("1. Open the file\n2. Write one line\n1. Open the file")).toBe("1. Open the file\n2. Write one line");
});

test("decimals and abbreviations stay whole enough to read", () => {
  expect(tidyReply("It costs 2.5 dollars.")).toBe("It costs 2.5 dollars.");
});

test("think blocks are left as written", () => {
  const t = "<think>a. a.</think>Answer.";
  expect(tidyReply(t)).toBe(t);
});
