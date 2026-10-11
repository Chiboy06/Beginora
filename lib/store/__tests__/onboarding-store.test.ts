jest.mock("../prefs", () => ({
  prefs: { onboardingDone: false },
}));

import { prefs } from "../prefs";
import { useOnboardingStore } from "../onboarding-store";

test("complete persists onboarding and updates the subscribed state", () => {
  prefs.onboardingDone = false;
  useOnboardingStore.setState({ done: false });
  useOnboardingStore.getState().complete();
  expect(prefs.onboardingDone).toBe(true);
  expect(useOnboardingStore.getState().done).toBe(true);
});
