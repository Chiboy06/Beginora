import { useEffect, useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { decompose } from "../../lib/ai/decomposer";
import type { Task } from "../../lib/storage/database";
import { colors, spacing, radii, typography } from "../../lib/theme";

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { tasks, setStatus, setFirstAction, removeTask } = useTaskStore();

  const task = tasks.find((t) => t.id === id);
  const [decomposing, setDecomposing] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: task?.title ?? "Task" });
  }, [task?.title]);

  // If no first action yet, trigger decomposition
  useEffect(() => {
    if (!task || task.firstAction || decomposing) return;
    setDecomposing(true);
    decompose(task.title)
      .then((result) => {
        setFirstAction(task.id, result.firstAction);
        setSteps(result.steps);
      })
      .catch(() => {})
      .finally(() => setDecomposing(false));
  }, [task?.id]);

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Task not found.</Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.backLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDone = task.status === "done";

  const handleDelete = () => {
    Alert.alert(
      "Remove task",
      "Remove this task? This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeTask(task.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Task title */}
      <Text style={styles.title}>{task.title}</Text>

      {/* First action — the hero element */}
      <View style={styles.firstActionCard}>
        <Text style={styles.firstActionLabel}>Your first action</Text>
        {decomposing ? (
          <View style={styles.decomposingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.decomposingText}>Finding your first step…</Text>
          </View>
        ) : (
          <Text style={styles.firstActionText}>
            {task.firstAction ?? "Tap below to get your first action."}
          </Text>
        )}
      </View>

      {/* Status controls */}
      <View style={styles.statusRow}>
        {(["pending", "active", "done"] as Task["status"][]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.statusBtn, task.status === s && styles.statusBtnActive]}
            onPress={() => setStatus(task.id, s)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: task.status === s }}
          >
            <Text style={[styles.statusBtnText, task.status === s && styles.statusBtnTextActive]}>
              {s === "pending" ? "To start" : s === "active" ? "In progress" : "Done ✓"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Breakdown steps */}
      {steps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How to get there</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Regenerate first action */}
      {!decomposing && (
        <TouchableOpacity
          style={styles.regenBtn}
          onPress={() => {
            setDecomposing(true);
            decompose(task.title)
              .then((result) => {
                setFirstAction(task.id, result.firstAction);
                setSteps(result.steps);
              })
              .catch(() => {})
              .finally(() => setDecomposing(false));
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.regenBtnText}>↻  Get a different first action</Text>
        </TouchableOpacity>
      )}

      {/* Delete */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDelete}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Remove this task"
      >
        <Text style={styles.deleteBtnText}>Remove task</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: 60 },
  title: { ...typography.heading, color: colors.textPrimary, marginBottom: 20 },
  firstActionCard: {
    backgroundColor: colors.accentMuted,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  firstActionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  firstActionText: { fontSize: 18, color: colors.textPrimary, lineHeight: 26, fontWeight: "500" },
  decomposingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  decomposingText: { fontSize: 15, color: colors.textSecondary },
  statusRow: { flexDirection: "row", gap: 8, marginBottom: 28 },
  statusBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  statusBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  statusBtnText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  statusBtnTextActive: { color: "#fff" },
  section: { marginBottom: 24 },
  sectionTitle: { ...typography.sectionTitle, color: colors.textMuted, marginBottom: 14 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumberText: { fontSize: 13, fontWeight: "700", color: colors.accent },
  stepText: { flex: 1, fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  regenBtn: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  regenBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
  deleteBtn: { paddingVertical: 12, alignItems: "center" },
  deleteBtnText: { fontSize: 14, color: colors.error },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFound: { fontSize: 16, color: colors.textMuted, marginBottom: 12 },
  backLink: { fontSize: 15, color: colors.accent, fontWeight: "600" },
});
