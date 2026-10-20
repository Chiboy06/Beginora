// Moods for "How was your day?". Few choices on purpose: long emotion grids
// are hard to pick from. Each has a word, never an emoji alone.

export interface Mood {
  key: string;
  emoji: string;
  label: string;
}

export const MOODS: Mood[] = [
  { key: "great", emoji: "😄", label: "Great" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "calm", emoji: "😌", label: "Calm" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "tired", emoji: "🥱", label: "Tired" },
  { key: "stressed", emoji: "😣", label: "Stressed" },
  { key: "sad", emoji: "😢", label: "Low" },
  { key: "frustrated", emoji: "😤", label: "Frustrated" },
];

// Three faces after a routine or focus step.
export const QUICK_MOODS = ["calm", "good", "stressed"];

export function moodFor(key: string | null | undefined): Mood | undefined {
  return MOODS.find((m) => m.key === key);
}

// "Things that helped" chips for the journal; the user can add their own.
export const HELPED_TAGS = ["Sleep", "Exercise", "Music", "Friends", "Family", "Outside", "Food", "Quiet time", "Got started", "Finished something"];
