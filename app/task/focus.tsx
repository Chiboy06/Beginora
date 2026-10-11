import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { FOCUS_DURATION_SECONDS, formatFocusTime, getRemainingSeconds } from "../../lib/ai/focus-timer";
import { detectFocusSignal, type FocusSignal } from "../../lib/focus/detection-engine";
import { GlassScreen, GlassSurface } from "../../components/GlassSurface";
import { colors, radii, spacing, typography } from "../../lib/theme";

export default function FocusScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = useTaskStore((s) => s.tasks.find((item) => item.id === id));
  const setStatus = useTaskStore((s) => s.setStatus);
  const recordOutcome = useTaskStore((s) => s.recordOutcome);

  const [remaining, setRemaining] = useState(FOCUS_DURATION_SECONDS);
  const [running, setRunning] = useState(true);
  const [extensionCount, setExtensionCount] = useState(0);
  const [signal, setSignal] = useState<FocusSignal>({ kind: "none" });
  const [signalDismissed, setSignalDismissed] = useState(false);

  const endAt = useRef<number | null>(null);
  const activeStartedAt = useRef(Date.now());
  // Ref mirrors state so runDetection always reads the current value,
  // avoiding the stale-closure problem with async callbacks inside effects.
  const extensionCountRef = useRef(0);

  const runDetection = async (count: number) => {
    if (!task) return;
    const result = await detectFocusSignal({
      taskId: task.id,
      activeStartedAt: activeStartedAt.current,
      extensionCount: count,
    });
    if (result.kind !== "none") {
      setSignal(result);
      setSignalDismissed(false);
    }
  };

  useEffect(() => {
    if (endAt.current === null) {
      endAt.current = Date.now() + FOCUS_DURATION_SECONDS * 1000;
    }
    if (!running) return;
    const interval = setInterval(() => {
      const deadline = endAt.current;
      if (deadline === null) return;
      const next = getRemainingSeconds(deadline);
      setRemaining(next);
      if (next === 0) {
        setRunning(false);
        runDetection(extensionCountRef.current);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [running]);

  const finishSession = async () => {
    try {
      if (task) await setStatus(task.id, "active");
      router.replace(`/task/${id}`);
    } catch {
      router.back();
    }
  };

  const stopForNow = async () => {
    try {
      if (task) {
        await recordOutcome(task.id, "stopped");
        await setStatus(task.id, "pending");
      }
      router.replace(`/task/${id}`);
    } catch {
      router.back();
    }
  };

  const toggleTimer = () => {
    if (running) {
      setRunning(false);
      return;
    }
    if (remaining > 0) {
      endAt.current = Date.now() + remaining * 1000;
    } else {
      // Extension — add another 5 minutes and run detection
      endAt.current = Date.now() + FOCUS_DURATION_SECONDS * 1000;
      setRemaining(FOCUS_DURATION_SECONDS);
      const next = extensionCountRef.current + 1;
      extensionCountRef.current = next;
      setExtensionCount(next);
      runDetection(next);
    }
    setRunning(true);
  };

  const displayTime = formatFocusTime(remaining);
  const showNudge = signal.kind !== "none" && !signalDismissed;

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>This task isn't available.</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GlassScreen>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>A small focus session</Text>
        <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>

        <GlassSurface style={styles.stepCard}>
          <Text style={styles.stepLabel}>START HERE</Text>
          <Text style={styles.stepText}>{task.firstAction ?? "Begin with one small action."}</Text>
        </GlassSurface>

        <Text style={styles.timer} accessibilityLabel={`${displayTime} remaining`}>
          {displayTime}
        </Text>

        <Text style={styles.body}>
          {remaining === 0
            ? "Five minutes are up. You can stop here or keep going."
            : "You only need to begin. There's no penalty for stopping early."}
        </Text>

        {showNudge && (
          <GlassSurface style={styles.nudgeCard}>
            <Text style={styles.nudgeMessage}>{signal.message}</Text>
            <Text style={styles.nudgeSuggestion}>{signal.suggestion}</Text>
            <TouchableOpacity
              onPress={() => setSignalDismissed(true)}
              accessibilityRole="button"
              style={styles.nudgeDismiss}
            >
              <Text style={styles.nudgeDismissText}>Got it</Text>
            </TouchableOpacity>
          </GlassSurface>
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={styles.primaryButton} onPress={toggleTimer} accessibilityRole="button">
            <Text style={styles.primaryText}>
              {remaining === 0 ? "Continue for 5 minutes" : running ? "Pause" : "Resume"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={finishSession} accessibilityRole="button">
            <Text style={styles.secondaryText}>Finish session</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopButton} onPress={stopForNow} accessibilityRole="button">
            <Text style={styles.stopText}>Stop for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent", padding: spacing.xl, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  taskTitle: { ...typography.heading, color: colors.textPrimary, textAlign: "center", marginBottom: 24 },
  stepCard: { borderRadius: radii.xl, padding: spacing.xl, width: "100%", marginBottom: 26 },
  stepLabel: { color: colors.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  stepText: { color: colors.textPrimary, fontSize: 18, lineHeight: 27, fontWeight: "600" },
  timer: { fontSize: 64, fontVariant: ["tabular-nums"], color: colors.textPrimary, fontWeight: "300", marginBottom: 8 },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 24 },
  nudgeCard: {
    width: "100%",
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSoft,
  },
  nudgeMessage: { color: colors.textPrimary, fontSize: 15, fontWeight: "600", marginBottom: 6 },
  nudgeSuggestion: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  nudgeDismiss: { marginTop: spacing.md, alignSelf: "flex-end" },
  nudgeDismissText: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  controls: { width: "100%", gap: 10 },
  primaryButton: { backgroundColor: colors.accent, paddingVertical: 15, alignItems: "center", borderRadius: radii.md },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: colors.surface, paddingVertical: 14, alignItems: "center", borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  stopButton: { paddingVertical: 12, alignItems: "center" },
  stopText: { color: colors.textMuted, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  link: { color: colors.accent, fontWeight: "600", marginTop: 10 },
});
