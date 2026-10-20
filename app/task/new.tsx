import { useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { decompose } from "../../lib/ai/decomposer";
import { GlassScreen, GlassSurface } from "../../components/GlassSurface";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { ScheduleFields, type Schedule } from "../../components/Kit";

export default function NewTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; context?: string; date?: string }>();
  const createTaskWithPlan = useTaskStore((s) => s.createTaskWithPlan);
  const addTask = useTaskStore((s) => s.addTask);
  const updateDetails = useTaskStore((s) => s.updateDetails);
  // Opened from a day in Plan: start on that day at 9:00.
  const [schedule, setSchedule] = useState<Schedule>(() => {
    const day = Number(params.date);
    return { dueAt: day > 0 ? new Date(day).setHours(9, 0, 0, 0) : null, repeat: "never", remind: true };
  });
  const [title, setTitle] = useState(params.title ?? "");
  const [context, setContext] = useState(params.context ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contextRef = useRef<ComponentRef<typeof TextInput>>(null);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await decompose(trimmed, context.trim() || undefined);
      const task = await createTaskWithPlan(trimmed.slice(0, 200), result.firstAction, result.steps);
      if (schedule.dueAt !== null) {
        await updateDetails(task.id, { title: task.title, steps: result.steps, dueAt: schedule.dueAt, repeat: schedule.repeat, remind: schedule.remind });
      }
      router.replace(`/task/${task.id}`);
    } catch {
      setError("I couldn’t save that task just now. Please try again.");
      setLoading(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !loading;

  // Save as written, without asking for a first step.
  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      await addTask(trimmed.slice(0, 200), {
        notes: context.trim() || null,
        dueAt: schedule.dueAt,
        repeat: schedule.repeat,
        remind: schedule.remind && schedule.dueAt !== null,
      });
      router.back();
    } catch {
      setError("I couldn’t save that task just now. Please try again.");
      setLoading(false);
    }
  };

  return (
    <GlassScreen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>What feels hard to start?</Text>
          <Text style={styles.subheading}>
            Describe it in your own words. You can keep it simple; Beginora will find one small first step.
          </Text>

          <GlassSurface style={styles.formCard}>
            <TextInput
              style={styles.titleInput}
              placeholder="e.g. Write my project proposal"
              placeholderTextColor={colors.textPlaceholder}
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              onSubmitEditing={() => contextRef.current?.focus()}
              autoFocus={!params.title}
              maxLength={200}
              accessibilityLabel="Task title"
            />

            <Text style={styles.contextLabel}>Anything that makes it feel hard? (optional)</Text>
            <TextInput
              ref={contextRef}
              style={styles.contextInput}
              placeholder="e.g. I don’t know where to start"
              placeholderTextColor={colors.textPlaceholder}
              value={context}
              onChangeText={setContext}
              multiline
              maxLength={500}
              accessibilityLabel="Additional context"
            />
          </GlassSurface>

          <GlassSurface style={styles.formCard}>
            <Text style={styles.contextLabel}>When (optional)</Text>
            <ScheduleFields value={schedule} onChange={setSchedule} />
          </GlassSurface>

        {error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Break this task into a first action"
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.onAccent} />
              <Text style={styles.btnText}>Finding one small step…</Text>
            </View>
          ) : (
            <Text style={styles.btnText}>Make it smaller</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, !canSubmit && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!canSubmit}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>Just save it</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.cancelBtn}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          The basic task flow works offline. If a local model is available, it can help shape the plan.
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.xl, paddingBottom: 48 },
  heading: { ...typography.heading, color: colors.textPrimary, marginBottom: 8 },
  subheading: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28 },
  formCard: { padding: spacing.lg, marginBottom: spacing.md, borderRadius: radii.xl, gap: 7 },
  titleInput: {
    backgroundColor: colors.field,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  contextLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginBottom: 8 },
  contextInput: {
    backgroundColor: colors.field,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 0,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: { backgroundColor: colors.disabled },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  saveBtn: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 15, alignItems: "center", marginBottom: 4 },
  saveText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
  errorText: { color: colors.error, fontSize: 14, marginBottom: 12 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, marginTop: 16 },
});
