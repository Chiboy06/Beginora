import { create } from "zustand";
import { prefs } from "./prefs";

interface OnboardingState {
  done: boolean;
  complete: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  done: prefs.onboardingDone,
  complete: () => {
    prefs.onboardingDone = true;
    set({ done: true });
  },
}));
