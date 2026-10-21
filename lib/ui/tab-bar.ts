// The floating glass tab bar's size, shared by the tab layout and the tab
// screens: content scrolls under the bar, so screens leave this much room.

import { useSafeAreaInsets } from "react-native-safe-area-context";

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_GAP = 10;

// Space from the bottom of the screen to the top of the bar.
export function useTabBarSpace(): number {
  return TAB_BAR_HEIGHT + TAB_BAR_GAP + useSafeAreaInsets().bottom;
}
