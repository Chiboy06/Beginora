import { scheduleFromWords } from "../schedule-words";

const AFTERNOON = new Date(2026, 9, 29, 15, 0); // Thu 29 Oct 2026, 15:00
const at = (h: number, m = 0, day = 29) => new Date(2026, 9, day, h, m);

test("the owner's exact evening plan becomes six timed items in order", () => {
  const said = "Set an appointment to read by 5, by 6 I'll be going out for jogging, by 7 I'll be having my dinner, by 8 I'll go out for light gaming, by 9 I'll watch movies, and by 11 I'll be sleeping";
  expect(scheduleFromWords(said, AFTERNOON)).toEqual([
    { title: "Read", at: at(17) },
    { title: "Going out for jogging", at: at(18) },
    { title: "Having my dinner", at: at(19) },
    { title: "Go out for light gaming", at: at(20) },
    { title: "Watch movies", at: at(21) },
    { title: "Sleeping", at: at(23) },
  ]);
});

test("explicit am/pm and 'tomorrow' are respected", () => {
  expect(scheduleFromWords("tomorrow gym at 7am, work at 9am and call mum at 6pm", AFTERNOON)).toEqual([
    { title: "Gym", at: at(7, 0, 30) },
    { title: "Work", at: at(9, 0, 30) },
    { title: "Call mum", at: at(18, 0, 30) },
  ]);
});

test("one title with two times repeats the title", () => {
  expect(scheduleFromWords("take my medicine at 8am and 8pm", new Date(2026, 9, 29, 6, 0))).toEqual([
    { title: "Take my medicine", at: at(8) },
    { title: "Take my medicine", at: at(20) },
  ]);
});

test("one time, or durations, are not a schedule", () => {
  expect(scheduleFromWords("remind me to call mum at 6pm", AFTERNOON)).toBeNull();
  expect(scheduleFromWords("study for 25 minutes then rest for 5 minutes", AFTERNOON)).toBeNull();
});
