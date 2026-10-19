import { createContext, useContext, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BlurTargetView, BlurView } from "expo-blur";
import { colors } from "../lib/theme";

type ViewInstance = ComponentRef<typeof View>;

const BlurTargetContext = createContext<RefObject<ViewInstance | null> | null>(null);

/** Warm atmospheric backdrop; intentionally decorative and never carries information. */
export function GlassScreen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const targetRef = useRef<ViewInstance | null>(null);
  return (
    <View style={[styles.screen, style]}>
      <BlurTargetView
        ref={targetRef}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.backdrop}>
          <View style={styles.glowSage} />
          <View style={styles.glowPearl} />
          <View style={styles.glowAmber} />
        </View>
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
        tint="light"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.surface}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  backdrop: { flex: 1, overflow: "hidden", backgroundColor: colors.bg },
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
    backgroundColor: "rgba(255, 255, 255, 0.78)",
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
    borderColor: "rgba(255,255,255,0.88)",
    backgroundColor: "rgba(255,255,255,0.58)",
    shadowColor: "#34443B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  surface: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.5)",
  },
});
