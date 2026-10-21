import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Chip, ScheduleFields, SectionTitle, kit, type Schedule } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { useTaskStore } from "../../lib/store/task-store";
import { prefs } from "../../lib/store/prefs";
import { colors, spacing } from "../../lib/theme";

export default function EditTaskScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id));
  const updateDetails = useTaskStore((s) => s.updateDetails);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [title, setTitle] = useState(task?.title ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [steps, setSteps] = useState<string[]>(task?.steps ?? []);
  const [project, setProject] = useState<string | null>(task?.project ?? null);
  const projectOptions = [...new Set([...prefs.projects, ...(task?.project ? [task.project] : [])])];
  const [newStep, setNewStep] = useState("");
  const [schedule, setSchedule] = useState<Schedule>({
    dueAt: task?.dueAt ?? null,
    repeat: task?.repeat ?? "never",
    remind: task ? !!task.reminderId || task.dueAt === null : true,
  });
  const [saving, setSaving] = useState(false);

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={kit.body}>This task isn't available.</Text>
        <Button label="Go back" kind="quiet" onPress={() => router.back()} />
      </View>
    );
  }

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await updateDetails(task.id, {
        title: title.trim().slice(0, 200),
        notes: notes.trim() || null,
        steps: steps.map((s) => s.trim()).filter(Boolean),
        project,
        dueAt: schedule.dueAt,
        repeat: schedule.repeat,
        remind: schedule.remind && schedule.dueAt !== null,
      });
      router.back();
    } catch {
      Alert.alert("Not saved", "Please try again in a moment.");
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert("Delete this task?", "Its reminder is cancelled too. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await removeTask(task.id);
            router.dismissAll();
          } catch {
            Alert.alert("Not deleted", "Please try again in a moment.");
          }
        },
      },
    ]);

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.muted}>Title</Text>
        <TextInput value={title} onChangeText={setTitle} style={kit.input} maxLength={200} accessibilityLabel="Task title" />

        <Text style={kit.muted}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[kit.input, { minHeight: 90, textAlignVertical: "top" }]}
          multiline
          maxLength={1000}
          placeholder="Anything that helps"
          placeholderTextColor={colors.textPlaceholder}
          accessibilityLabel="Notes"
        />

        {projectOptions.length > 0 && (
          <>
            <SectionTitle>Project</SectionTitle>
            <View style={kit.chips}>
              <Chip label="None" selected={!project} onPress={() => setProject(null)} />
              {projectOptions.map((p) => <Chip key={p} label={p} selected={project === p} onPress={() => setProject(p)} />)}
            </View>
          </>
        )}

        <SectionTitle>When</SectionTitle>
        <Card><ScheduleFields value={schedule} onChange={setSchedule} /></Card>

        <SectionTitle>Subtasks</SectionTitle>
        <Card style={{ gap: spacing.sm }}>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <TextInput
                value={step}
                onChangeText={(t) => setSteps((all) => all.map((s, j) => (j === i ? t : s)))}
                style={[kit.input, styles.flex]}
                accessibilityLabel={`Subtask ${i + 1}`}
              />
              <TouchableOpacity
                onPress={() => setSteps((all) => all.filter((_, j) => j !== i))}
                accessibilityRole="button"
                accessibilityLabel={`Remove subtask ${i + 1}`}
                style={styles.iconBtn}
              >
                <Ionicons name="remove-circle-outline" size={24} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.stepRow}>
            <TextInput
              value={newStep}
              onChangeText={setNewStep}
              placeholder="Add a subtask"
              placeholderTextColor={colors.textPlaceholder}
              style={[kit.input, styles.flex]}
              onSubmitEditing={() => { if (newStep.trim()) { setSteps((all) => [...all, newStep.trim()]); setNewStep(""); } }}
              accessibilityLabel="New subtask"
            />
            <TouchableOpacity
              onPress={() => { if (newStep.trim()) { setSteps((all) => [...all, newStep.trim()]); setNewStep(""); } }}
              accessibilityRole="button"
              accessibilityLabel="Add subtask"
              style={styles.iconBtn}
            >
              <Ionicons name="add-circle" size={26} color={colors.accent} />
            </TouchableOpacity>
          </View>
        </Card>

        <Button label="Save" onPress={save} disabled={!title.trim() || saving} style={{ marginTop: spacing.lg }} />
        <Button label="Delete task" kind="danger" icon="trash-outline" onPress={remove} />
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
