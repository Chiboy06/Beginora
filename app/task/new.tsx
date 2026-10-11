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

export default function NewTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; context?: string }>();
  const addTask = useTaskStore((s) => s.addTask);
  const setPlan = useTaskStore((s) => s.setPlan);
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
      const task = await addTask(trimmed.slice(0, 200));
      const result = await decompose(trimmed, context.trim() || undefined);
      await setPlan(task.id, result.firstAction, result.steps);
      router.replace(`/task/${task.id}`);
    } catch {
      setError("I couldn’t save that task just now. Please try again.");
      setLoading(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !loading;

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
              <ActivityIndicator color="#fff" />
              <Text style={styles.btnText}>Finding one small step…</Text>
            </View>
          ) : (
            <Text style={styles.btnText}>Make it smaller</Text>
          )}
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
    backgroundColor: "rgba(255,255,255,0.82)",
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
    backgroundColor: "rgba(255,255,255,0.82)",
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
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cancelBtn: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
  errorText: { color: colors.error, fontSize: 14, marginBottom: 12 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19, marginTop: 16 },
});
