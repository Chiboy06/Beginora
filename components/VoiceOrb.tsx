// The hands-free voice panel: an orb that grows with your voice, your words as
// you speak, and what Beginora is doing. Tap to finish speaking, or to cut
// Beginora off and talk. Motion is kept still when the phone asks for less.

import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../lib/theme";

export function VoiceOrb({
  listening, speaking, thinking, heard, level, onTap,
}: {
  listening: boolean;
  speaking: boolean;
  thinking: boolean;
  heard: string;
  level: number;
  onTap: () => void;
}) {
  // Created once; state, not a ref, so render never reads a ref.
  const [scale] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    // Follows the microphone while listening; breathes gently while talking.
    const target = listening ? 1 + level * 0.35 : speaking ? 1.12 : 1;
    Animated.spring(scale, { toValue: target, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }, [listening, speaking, level, reduceMotion, scale]);

  const state = listening ? "Listening… tap when you're done" : thinking ? "Thinking…" : speaking ? "Talking. Tap to interrupt" : "";

  return (
    <View style={styles.panel}>
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={listening ? "Finish speaking" : speaking ? "Interrupt and talk" : "Voice"}
        style={styles.hit}
      >
        <Animated.View style={[styles.orb, listening && styles.orbListening, { transform: [{ scale }] }]} />
      </Pressable>
      <Text style={styles.state} accessibilityLiveRegion="polite">{state}</Text>
      {!!heard && (
        <Text style={styles.heard} numberOfLines={4}>
          {heard}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: "center", paddingVertical: spacing.md, gap: spacing.sm },
  hit: { width: 96, height: 96, alignItems: "center", justifyContent: "center" },
  orb: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, borderWidth: 2, borderColor: colors.accent },
  orbListening: { backgroundColor: colors.accent },
  state: { ...typography.footnote, color: colors.textSecondary, fontWeight: "600" },
  heard: {
    ...typography.callout,
    color: colors.textPrimary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.glass,
  },
});
