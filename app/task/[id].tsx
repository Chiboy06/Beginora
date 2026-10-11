import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { decompose } from "../../lib/ai/decomposer";
import { getTaskOutcomes, type TaskOutcomeRecord } from "../../lib/storage/database";
import { scheduleLocalReminder } from "../../lib/native/reminders";
import { GlassScreen, GlassSurface } from "../../components/GlassSurface";
import { colors, radii, spacing, typography } from "../../lib/theme";

function outcomeLabel(outcome: TaskOutcomeRecord["outcome"]): string {
  const labels: Record<TaskOutcomeRecord["outcome"], string> = {
    started: "Started a focus session",
    completed: "Marked the first step done",
    snoozed: "Snoozed for another time",
    wrong_moment: "This step wasn’t the right fit",
    stopped: "Stopped the focus session",
    retried: "Asked for another first step",
  };
  return labels[outcome];
}

export default function TaskDetailScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const task = useTaskStore((s) => s.tasks.find((item) => item.id === id));
  const setPlan = useTaskStore((s) => s.setPlan);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setReminderId = useTaskStore((s) => s.setReminderId);
  const recordOutcome = useTaskStore((s) => s.recordOutcome);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [decomposing, setDecomposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [outcomes, setOutcomes] = useState<TaskOutcomeRecord[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: task?.title ?? "Task" });
  }, [navigation, task?.title]);

  useEffect(() => {
    if (!id) return;
    getTaskOutcomes(id).then(setOutcomes).catch(() => setOutcomes([]));
  }, [id]);

  const taskId = task?.id;
  const taskTitle = task?.title;
  const hasFirstAction = Boolean(task?.firstAction);

  useEffect(() => {
    if (!taskId || !taskTitle || hasFirstAction) return;
    const timer = setTimeout(() => {
      setDecomposing(true);
      void decompose(taskTitle)
        .then((result) => setPlan(taskId, result.firstAction, result.steps))
        .catch(() => {})
        .finally(() => setDecomposing(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [taskId, taskTitle, hasFirstAction, setPlan]);

  const refreshOutcomes = async () => {
    if (!id) return;
    setOutcomes(await getTaskOutcomes(id));
  };

  const handleDone = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await setStatus(task.id, "done");
      await recordOutcome(task.id, "completed");
      await refreshOutcomes();
    } catch {
      Alert.alert("Couldn’t save that yet", "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const handleSnooze = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await setStatus(task.id, "snoozed");
      await recordOutcome(task.id, "snoozed");
      router.back();
    } catch {
      Alert.alert("Couldn’t snooze this task", "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await recordOutcome(task.id, "wrong_moment");
      const result = await decompose(task.title);
      await setPlan(task.id, result.firstAction, result.steps);
      await recordOutcome(task.id, "retried");
      await refreshOutcomes();
      setShowSteps(false);
    } catch {
      Alert.alert("Couldn’t find another step", "Your task is still saved. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await setStatus(task.id, "active");
      await recordOutcome(task.id, "started");
      router.push({ pathname: "/task/focus", params: { id: task.id } });
    } catch {
      Alert.alert("Couldn’t start the focus session", "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const handleReminder = async () => {
    if (!task || task.reminderId) return;
    setBusy(true);
    try {
      const result = await scheduleLocalReminder(
        `Try this first step: ${task.firstAction ?? task.title}`,
        new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      );
      if (!result.success || !result.identifier) {
        Alert.alert("Reminder not set", result.message);
        return;
      }
      await setReminderId(task.id, result.identifier);
      Alert.alert("One reminder set", "I’ll give you a quiet reminder in about 15 minutes.");
    } catch {
      Alert.alert("Reminder not set", "You can still return to this task whenever you’re ready.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Remove task", "Remove this task and its local activity? This can’t be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            if (task) await removeTask(task.id);
            router.back();
          } catch {
            Alert.alert("Couldn’t remove task", "Please try again in a moment.");
          }
        },
      },
    ]);
  };

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Task not found.</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDone = task.status === "done";
  const isEmailTask = /\b(email|reply|respond|mail|message)\b/i.test(`${task.title} ${task.firstAction ?? ""}`);

  return (
    <GlassScreen>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{task.title}</Text>

      <GlassSurface style={styles.firstActionCard}>
        <Text style={styles.firstActionLabel}>Start here</Text>
        {decomposing ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.secondaryText}>Finding one small step…</Text>
          </View>
        ) : (
          <Text style={styles.firstActionText}>
            {task.firstAction ?? "Your first step will appear here."}
          </Text>
        )}
        {!!task.firstAction && <Text style={styles.durationText}>A small step to begin with</Text>}
      </GlassSurface>

      <Text style={styles.encouragement}>You only need to begin. You can stop whenever you want.</Text>

      <TouchableOpacity
        style={[styles.primaryButton, (busy || !task.firstAction || isDone) && styles.disabledButton]}
        onPress={handleStart}
        disabled={busy || !task.firstAction || isDone}
        accessibilityRole="button"
      >
        <Text style={styles.primaryButtonText}>Start 5 minutes</Text>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          onPress={handleDone}
          disabled={busy || isDone}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          onPress={handleSnooze}
          disabled={busy || isDone}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Snooze</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.quietButton}
        onPress={handleRetry}
        disabled={busy || decomposing || isDone}
        accessibilityRole="button"
      >
        <Text style={styles.quietButtonText}>Not the right step? Try another</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.reminderButton, (busy || !!task.reminderId || isDone) && styles.disabledButton]}
        onPress={handleReminder}
        disabled={busy || !!task.reminderId || isDone}
        accessibilityRole="button"
      >
        <Text style={styles.reminderText}>
          {task.reminderId ? "One reminder is set" : "Remind me once in 15 minutes"}
        </Text>
      </TouchableOpacity>

      {isEmailTask && (
        <TouchableOpacity
          style={styles.emailButton}
          onPress={() => router.push({
            pathname: "/email",
            params: {
              subject: task.title.slice(0, 200),
              body: `Task: ${task.title}\n\nFirst step: ${task.firstAction ?? "Open your email app and start a draft."}\n\n`,
            },
          })}
          accessibilityRole="button"
          accessibilityLabel="Open an editable email draft for this task"
        >
          <Text style={styles.emailButtonText}>Draft in email app</Text>
        </TouchableOpacity>
      )}

      {task.steps.length > 0 && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.stepsToggle}
            onPress={() => setShowSteps((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showSteps }}
          >
            <Text style={styles.sectionTitle}>Possible next steps</Text>
            <Text style={styles.toggleMark}>{showSteps ? "−" : "+"}</Text>
          </TouchableOpacity>
          {showSteps && task.steps.map((step, index) => (
            <View key={`${index}-${step}`} style={styles.stepRow}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {outcomes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {outcomes.slice(0, 4).map((entry) => (
            <View key={entry.id} style={styles.activityRow}>
              <Text style={styles.activityText}>{outcomeLabel(entry.outcome)}</Text>
              <Text style={styles.activityDate}>{new Date(entry.createdAt).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} accessibilityRole="button">
        <Text style={styles.deleteText}>Remove task and activity</Text>
      </TouchableOpacity>
    </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.xl, paddingBottom: 60 },
  title: { ...typography.heading, color: colors.textPrimary, marginBottom: 20 },
  firstActionCard: {
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: 14,
    borderWidth: 1,
  },
  firstActionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  firstActionText: { fontSize: 20, color: colors.textPrimary, lineHeight: 29, fontWeight: "600" },
  durationText: { fontSize: 13, color: colors.textSecondary, marginTop: 12 },
  encouragement: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginBottom: 18 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  primaryButton: { backgroundColor: colors.accent, paddingVertical: 16, borderRadius: radii.md, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondaryButton: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: 13, alignItems: "center" },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  quietButton: { paddingVertical: 14, alignItems: "center" },
  quietButtonText: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  reminderButton: { backgroundColor: colors.surface, borderRadius: radii.md, padding: 13, alignItems: "center", borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  reminderText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
  emailButton: { backgroundColor: "rgba(228,237,232,0.86)", borderRadius: radii.md, padding: 13, alignItems: "center", borderWidth: 1, borderColor: colors.accentSoft, marginTop: 6 },
  emailButtonText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  disabledButton: { opacity: 0.5 },
  section: { marginTop: 24 },
  stepsToggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  sectionTitle: { ...typography.sectionTitle, color: colors.textMuted },
  toggleMark: { fontSize: 22, color: colors.textMuted },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 12 },
  stepNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumberText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  stepText: { flex: 1, fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  activityRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  activityText: { color: colors.textPrimary, fontSize: 14 },
  activityDate: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  deleteButton: { paddingVertical: 16, alignItems: "center", marginTop: 12 },
  deleteText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, color: colors.textMuted, marginBottom: 12 },
  link: { fontSize: 15, color: colors.accent, fontWeight: "600" },
  secondaryText: { fontSize: 15, color: colors.textSecondary },
});
