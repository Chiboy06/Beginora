import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useTaskStore } from "../../lib/store/task-store";
import type { Task } from "../../lib/storage/database";
import { colors, spacing, radii, typography } from "../../lib/theme";

type Filter = "pending" | "active" | "done" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "To start" },
  { key: "active", label: "In progress" },
  { key: "done", label: "Done" },
];

function TaskItem({
  task,
  onDone,
  onPress,
}: {
  task: Task;
  onDone: () => void;
  onPress: () => void;
}) {
  const isDone = task.status === "done";

  return (
    <TouchableOpacity
      style={[styles.taskCard, isDone && styles.taskCardDone]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Task: ${task.title}`}
    >
      <TouchableOpacity
        style={[styles.checkbox, isDone && styles.checkboxDone]}
        onPress={onDone}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={isDone ? "Mark as not done" : "Mark as done"}
      >
        {isDone && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <View style={styles.taskContent}>
        <Text
          style={[styles.taskTitle, isDone && styles.taskTitleDone]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {task.firstAction && !isDone && (
          <View style={styles.firstActionRow}>
            <Text style={styles.firstActionLabel}>Start here →</Text>
            <Text style={styles.firstActionText} numberOfLines={2}>
              {task.firstAction}
            </Text>
          </View>
        )}
        {isDone && task.completedAt && (
          <Text style={styles.completedAt}>
            Done {new Date(task.completedAt).toLocaleDateString()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const { tasks, loading, error, loadTasks, setStatus, clearError } = useTaskStore();
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [{ text: "OK", onPress: clearError }]);
    }
  }, [error]);

  const filtered = tasks.filter((t) => {
    if (filter === "all") return t.isDeleted !== 1;
    return t.status === filter && t.isDeleted !== 1;
  });

  const handleToggleDone = (task: Task) => {
    const next = task.status === "done" ? "pending" : "done";
    setStatus(task.id, next);
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
          >
            <Text
              style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TaskItem
              task={item}
              onDone={() => handleToggleDone(item)}
              onPress={() => router.push(`/task/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>✓</Text>
              <Text style={styles.emptyTitle}>
                {filter === "done" ? "Nothing done yet" : "No tasks here"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {filter === "done"
                  ? "Complete a task and it will show up here."
                  : "Tap + to add something you want to work on."}
              </Text>
            </View>
          }
        />
      )}

      {/* Add task FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/task/new")}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Add new task"
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.full,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterChipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  filterChipTextActive: { color: "#fff" },
  list: { padding: spacing.lg, paddingBottom: 100, gap: 10 },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 12,
  },
  taskCardDone: { opacity: 0.6 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  checkboxDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  taskContent: { flex: 1 },
  taskTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  taskTitleDone: { textDecorationLine: "line-through", color: colors.textMuted },
  firstActionRow: {
    marginTop: 8,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.sm,
    padding: 10,
  },
  firstActionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  firstActionText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  completedAt: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyEmoji: { fontSize: 40, marginBottom: 16, opacity: 0.3 },
  emptyTitle: { ...typography.heading, fontSize: 20, color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: "center", lineHeight: 22 },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  fabText: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 32 },
});
