// FloatingBubble — a small persistent overlay that stays visible when the app
// is backgrounded, similar to how Gemini shows a floating icon.
//
// On Android this works by keeping the foreground service running (already
// implemented in BeginoraService.kt) and showing a persistent notification.
// The bubble itself is rendered as a React Native Modal with windowSoftInputMode
// set to allow it to float. When the app is in background the notification
// acts as the entry point; when foregrounded the bubble is visible.
//
// The bubble shows the current active task title (if any) and a mic button
// for quick voice input without opening the full app.

import { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "../lib/store/task-store";
import { updateServiceNotification } from "../lib/native/vesta-service";
import { colors, radii, spacing } from "../lib/theme";

export function FloatingBubble() {
  const [appInBackground, setAppInBackground] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const tasks = useTaskStore((s) => s.tasks);

  const activeTask = tasks.find((t) => t.status === "active") ?? null;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  // Track app state — show bubble when backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setAppInBackground(state === "background" || state === "inactive");
    });
    return () => sub.remove();
  }, []);

  // Keep the foreground service notification text in sync with the active task
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const label = activeTask
      ? `Active: ${activeTask.title.slice(0, 60)}`
      : pendingCount > 0
        ? `${pendingCount} task${pendingCount === 1 ? "" : "s"} waiting`
        : "Ready";
    updateServiceNotification(label).catch(() => {});
  }, [activeTask, pendingCount]);

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
              <TouchableOpacity
                style={styles.voiceBtn}
                onPress={() => {
                  setExpanded(false);
                  Linking.openURL("beginora://voice").catch(() => {});
                }}
                accessibilityRole="button"
                accessibilityLabel="Voice input"
              >
                <Ionicons name="mic-outline" size={20} color={colors.accent} />
                <Text style={styles.voiceLabel}>Speak</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => {
                  setExpanded(false);
                  Linking.openURL(`beginora://task/${activeTask.id}`).catch(() => {});
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
