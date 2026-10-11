import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import { decompose } from "../../lib/ai/decomposer";
import { colors, spacing, radii, typography } from "../../lib/theme";

export default function NewTaskScreen() {
  const router = useRouter();
  const addTask = useTaskStore((s) => s.addTask);
  const setFirstAction = useTaskStore((s) => s.setFirstAction);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const contextRef = useRef<TextInput>(null);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const task = await addTask(trimmed, context.trim() || undefined);
      // Fire decomposition — don't block navigation on it
      decompose(trimmed, context.trim() || undefined)
        .then((result) => setFirstAction(task.id, result.firstAction))
        .catch(() => {});
      router.replace(`/task/${task.id}`);
    } catch {
      setLoading(false);
    }
  };

  const canSubmit = title.trim().length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>What do you want to work on?</Text>
        <Text style={styles.subheading}>
          Describe it in your own words — even if it feels vague or overwhelming.
        </Text>

        <TextInput
          style={styles.titleInput}
          placeholder="e.g. Write my project proposal"
          placeholderTextColor={colors.textPlaceholder}
          value={title}
          onChangeText={setTitle}
          returnKeyType="next"
          onSubmitEditing={() => contextRef.current?.focus()}
          autoFocus
          maxLength={200}
          accessibilityLabel="Task title"
        />

        <Text style={styles.contextLabel}>
          Anything that makes it feel hard? (optional)
        </Text>
        <TextInput
          ref={contextRef}
          style={styles.contextInput}
          placeholder="e.g. I don't know where to start, I've been putting it off..."
          placeholderTextColor={colors.textPlaceholder}
          value={context}
          onChangeText={setContext}
          multiline
          maxLength={500}
          accessibilityLabel="Additional context"
        />

        <TouchableOpacity
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={!canSubmit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Create task and find first action"
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Find my first action →</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Beginora will break this down into one small, doable step you can take right now.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: 48 },
  heading: { ...typography.heading, color: colors.textPrimary, marginBottom: 8 },
  subheading: { fontSize: 15, color: colors.textSecondary, lineHeight: 22, marginBottom: 28 },
  titleInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 20,
  },
  contextLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginBottom: 8 },
  contextInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 28,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  btnDisabled: { backgroundColor: colors.disabled },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
});
