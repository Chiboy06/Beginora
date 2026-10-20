import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

// Android runs edge-to-edge, so the window no longer shrinks for the keyboard;
// screens pad themselves by its height to keep the focused field visible.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
