// Ready-made routines the user can add and then change. Short steps with a
// few minutes each; every routine has a shorter version for hard days.

import type { RoutineStep } from "../storage/database";

export interface RoutineTemplate {
  id: string;
  name: string;
  emoji: string;
  about: string;
  steps: RoutineStep[];
}

export const ROUTINE_LIBRARY: RoutineTemplate[] = [
  {
    id: "morning",
    name: "Morning start",
    emoji: "🌅",
    about: "Get up and ready without rushing.",
    steps: [
      { title: "Drink a glass of water", minutes: 1 },
      { title: "Wash and get dressed", minutes: 15 },
      { title: "Eat something", minutes: 10 },
      { title: "Check today's plan", minutes: 3 },
    ],
  },
  {
    id: "morning-minimum",
    name: "Minimum morning",
    emoji: "🌤️",
    about: "For hard mornings: only the essentials.",
    steps: [
      { title: "Get dressed", minutes: 5 },
      { title: "Eat something small", minutes: 5 },
      { title: "Check the next appointment", minutes: 2 },
    ],
  },
  {
    id: "study",
    name: "Study start",
    emoji: "📚",
    about: "Ease into studying or deep work.",
    steps: [
      { title: "Clear the desk", minutes: 3 },
      { title: "Put the phone in another room", minutes: 1 },
      { title: "Open the one file you need", minutes: 1 },
      { title: "Work on it", minutes: 25 },
      { title: "Short break", minutes: 5 },
    ],
  },
  {
    id: "leaving",
    name: "Leaving the house",
    emoji: "🎒",
    about: "Keys, phone, wallet: nothing left behind.",
    steps: [
      { title: "Phone, keys, wallet", minutes: 2 },
      { title: "Bag packed for today", minutes: 3 },
      { title: "Lights and taps off", minutes: 2 },
    ],
  },
  {
    id: "evening",
    name: "Evening wind-down",
    emoji: "🌙",
    about: "Close the day and prepare tomorrow.",
    steps: [
      { title: "Tidy one small area", minutes: 5 },
      { title: "Lay out tomorrow's clothes", minutes: 3 },
      { title: "Look at tomorrow's plan", minutes: 3 },
      { title: "How was your day?", minutes: 2 },
    ],
  },
  {
    id: "bedtime",
    name: "Bedtime",
    emoji: "🛏️",
    about: "Slow down for sleep.",
    steps: [
      { title: "Phone on charge, away from bed", minutes: 1 },
      { title: "Brush teeth and wash", minutes: 5 },
      { title: "Read or stretch", minutes: 10 },
    ],
  },
  {
    id: "reset",
    name: "Reset when stuck",
    emoji: "🔄",
    about: "When everything feels like too much.",
    steps: [
      { title: "Three slow breaths", minutes: 1 },
      { title: "Drink some water", minutes: 1 },
      { title: "Write down what's on your mind", minutes: 5 },
      { title: "Pick one small thing", minutes: 2 },
    ],
  },
];

export const routineMinutes = (steps: RoutineStep[]) => steps.reduce((n, s) => n + s.minutes, 0);

// "Make the bed 5" → { title: "Make the bed", minutes: 5 }; no number means 5 minutes.
export function parseSteps(text: string): RoutineStep[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?)[\s,·-]*(\d{1,3})\s*(?:m|min|mins|minutes)?$/i.exec(line);
      return m && m[1].trim() ? { title: m[1].trim(), minutes: Math.min(180, Math.max(1, Number(m[2]))) } : { title: line, minutes: 5 };
    });
}
