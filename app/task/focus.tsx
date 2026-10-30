import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Button, Chip, StepTimer, kit } from "../../components/Kit";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { FOCUS_DURATION_SECONDS, formatFocusTime, getRemainingSeconds } from "../../lib/ai/focus-timer";
import { detectFocusSignal, type FocusSignal } from "../../lib/focus/detection-engine";
import { GlassScreen, GlassSurface } from "../../components/GlassSurface";
import { colors, radii, spacing, typography } from "../../lib/theme";

const LENGTHS = [5, 10, 15, 25];

// Focus without a task: pick a length, name it if you like, and start.
function FreeFocus({ initialMinutes }: { initialMinutes: number }) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [what, setWhat] = useState("");
  const [ended, setEnded] = useState(false);
  const router = useRouter();
  const onFinish = useCallback(() => setEnded(true), []);
  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.lg }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.h1} accessibilityRole="header">What would you like to work on?</Text>
        <TextInput
          value={what}
          onChangeText={setWhat}
          placeholder="e.g. Read the first page"
          placeholderTextColor={colors.textPlaceholder}
          style={kit.input}
          accessibilityLabel="What you will work on"
        />
        <View style={kit.chips}>
          {LENGTHS.map((m) => <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => { setMinutes(m); setEnded(false); }} />)}
        </View>
        <StepTimer minutes={minutes} onFinish={onFinish} />
        {ended && (
          <View style={{ gap: spacing.sm }}>
            <Text style={kit.body}>Your {minutes} minutes are up. Take a break, keep going, or stop here.</Text>
            <Button label="Take a 5 minute break" kind="secondary" onPress={() => { setMinutes(5); setEnded(false); }} />
            <Button label="Finish for now" kind="quiet" onPress={() => router.back()} />
          </View>
        )}
      </ScrollView>
    </GlassScreen>
  );
}

export default function FocusScreen() {
  const { id = "", minutes: minutesParam } = useLocalSearchParams<{ id: string; minutes?: string }>();
  const lengthMinutes = LENGTHS.includes(Number(minutesParam)) ? Number(minutesParam) : FOCUS_DURATION_SECONDS / 60;
  if (!id) return <FreeFocus initialMinutes={lengthMinutes === 5 ? 10 : lengthMinutes} />;
  return <TaskFocus id={id} lengthSeconds={lengthMinutes * 60} />;
}

function TaskFocus({ id, lengthSeconds }: { id: string; lengthSeconds: number }) {
  const router = useRouter();
  const task = useTaskStore((s) => s.tasks.find((item) => item.id === id));
  const setStatus = useTaskStore((s) => s.setStatus);
  const setStatusWithOutcome = useTaskStore((s) => s.setStatusWithOutcome);

  const [remaining, setRemaining] = useState(lengthSeconds);
  const [running, setRunning] = useState(true);
  const [signal, setSignal] = useState<FocusSignal>({ kind: "none" });
  const [signalDismissed, setSignalDismissed] = useState(false);

  const endAt = useRef<number | null>(null);
  const activeStartedAt = useRef(0);
  // Ref mirrors state so runDetection always reads the current value,
  // avoiding the stale-closure problem with async callbacks inside effects.
  const extensionCountRef = useRef(0);

  const runDetection = useCallback(async (count: number) => {
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
  }, [task]);

  useEffect(() => {
    if (activeStartedAt.current === 0) activeStartedAt.current = Date.now();
    if (endAt.current === null) {
      endAt.current = Date.now() + lengthSeconds * 1000;
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
  }, [running, runDetection, lengthSeconds]);

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
        await setStatusWithOutcome(task.id, "pending", "stopped");
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
      endAt.current = Date.now() + lengthSeconds * 1000;
      setRemaining(lengthSeconds);
      const next = extensionCountRef.current + 1;
      extensionCountRef.current = next;
      runDetection(next);
    }
    setRunning(true);
  };

  const displayTime = formatFocusTime(remaining);
  const showNudge = signal.kind !== "none" && !signalDismissed;

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>This task isn’t available.</Text>
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
            ? `${lengthSeconds / 60} minutes are up. Take a break, keep going, or stop here.`
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
              {remaining === 0 ? `Another ${lengthSeconds / 60} minutes` : running ? "Pause" : "Resume"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={finishSession} accessibilityRole="button">
            <Text style={styles.secondaryText}>Finish session</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.stopButton} onPress={stopForNow} accessibilityRole="button">
            <Text style={styles.stopText}>{remaining === 0 ? "Take a break" : "Stop for now"}</Text>
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
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: colors.surface, paddingVertical: 14, alignItems: "center", borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  stopButton: { paddingVertical: 12, alignItems: "center" },
  stopText: { color: colors.textMuted, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  link: { color: colors.accent, fontWeight: "600", marginTop: 10 },
});
