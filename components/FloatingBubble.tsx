// FloatingBubble — an in-app foreground overlay for the active task. The
// optional Android background model service is separately controlled in Settings.
//
// The overlay shows the active task only inside the app and provides quick voice input.

import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { VoiceButton } from "./VoiceButton";
import { useTaskStore } from "../lib/store/task-store";
import { colors, radii, spacing } from "../lib/theme";

export function FloatingBubble() {
  const router = useRouter();
  const [appInBackground, setAppInBackground] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);

  const activeTask = tasks.find((t) => t.status === "active") ?? null;

  // Track app state — show bubble when backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setAppInBackground(state === "background" || state === "inactive");
    });
    return () => sub.remove();
  }, []);


  // The floating bubble is only shown when the app is foregrounded and the
  // user has an active task — it acts as a persistent heads-up.
  // When backgrounded, the foreground service notification handles re-entry.
  if (appInBackground || !activeTask) return null;

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setExpanded(false)}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        {expanded ? (
          <View style={styles.card}>
            <Text style={styles.label}>ACTIVE TASK</Text>
            <Text style={styles.title} numberOfLines={2}>{activeTask.title}</Text>
            {activeTask.firstAction && (
              <Text style={styles.step} numberOfLines={2}>{activeTask.firstAction}</Text>
            )}
            <View style={styles.row}>
              {Platform.OS === "android" && (
                <View style={styles.voiceBtn}>
                  <VoiceButton
                    size={20}
                    onTranscript={(text) => {
                      setExpanded(false);
                      router.push({ pathname: "/chat", params: { voice_text: text } });
                    }}
                  />
                <Text style={styles.voiceLabel}>Speak</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => {
                  setExpanded(false);
                  router.push({ pathname: "/task/[id]", params: { id: activeTask.id } });
                }}
                accessibilityRole="button"
              >
                <Text style={styles.openLabel}>Open task</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setExpanded(false)}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.bubble}
            onPress={() => setExpanded(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Beginora — ${activeTask.title}`}
          >
            <Text style={styles.bubbleEmoji}>🌱</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingBottom: 100,
    paddingRight: spacing.lg,
  },
  bubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  bubbleEmoji: { fontSize: 26 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.accent,
    marginBottom: 6,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 4 },
  step: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  voiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.full,
  },
  voiceLabel: { fontSize: 13, fontWeight: "600", color: colors.accent },
  openBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    borderRadius: radii.full,
    alignItems: "center",
  },
  openLabel: { fontSize: 13, fontWeight: "700", color: "#fff" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
});
