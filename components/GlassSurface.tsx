import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, isDark } from "../lib/theme";
import { useKeyboardHeight } from "../lib/ui/use-keyboard-height";

type ViewInstance = ComponentRef<typeof View>;

const BlurTargetContext = createContext<RefObject<ViewInstance | null> | null>(null);

/** Warm atmospheric backdrop; intentionally decorative and never carries information. */
export function GlassScreen({
  children,
  style,
  avoidKeyboard = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Pad for the keyboard so the focused field stays visible; off for screens
  // that handle the keyboard themselves (chat).
  avoidKeyboard?: boolean;
}) {
  const targetRef = useRef<ViewInstance | null>(null);
  const keyboardHeight = useKeyboardHeight();
  return (
    <View style={[styles.screen, style, avoidKeyboard && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null]}>
      <BlurTargetView
        ref={targetRef}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <LinearGradient
          colors={[colors.gradientTop, colors.bg, colors.gradientBottom]}
          locations={[0, 0.45, 1]}
          style={styles.backdrop}
        >
          <View style={styles.glowSage} />
          <View style={styles.glowPearl} />
          <View style={styles.glowAmber} />
        </LinearGradient>
      </BlurTargetView>
      <BlurTargetContext.Provider value={targetRef}>{children}</BlurTargetContext.Provider>
    </View>
  );
}

/**
 * A translucent surface with a fine highlight edge. Android blur is limited to
 * API 31+; older devices keep the same readable translucent fill without the
 * expensive RenderScript blur path.
 */
export function GlassSurface({
  children,
  style,
  intensity = 28,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  const targetRef = useContext(BlurTargetContext);
  const blurMethod = Platform.OS === "android"
    ? (Number(Platform.Version) >= 31 ? "dimezisBlurViewSdk31Plus" : "none")
    : undefined;

  return (
    <View style={[styles.clip, style]}>
      <BlurView
        blurTarget={Platform.OS === "android" ? targetRef ?? undefined : undefined}
        blurMethod={blurMethod}
        blurReductionFactor={3}
        intensity={intensity}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.surface}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backdrop: { flex: 1, overflow: "hidden" },
  glowSage: {
    position: "absolute",
    top: -95,
    right: -65,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: "rgba(138, 180, 158, 0.25)",
  },
  glowPearl: {
    position: "absolute",
    top: "35%",
    left: -125,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.glassStrong,
  },
  glowAmber: {
    position: "absolute",
    right: -80,
    bottom: -105,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(224, 198, 150, 0.20)",
  },
  clip: {
    overflow: "hidden",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    shadowColor: "#34443B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  surface: {
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
});
