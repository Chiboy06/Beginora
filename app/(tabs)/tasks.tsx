// Plan: week and month views, the selected day's tasks and reminders, and
// "Sort later" for tasks without a time. Every action is a visible button.

import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTaskStore } from "../../lib/store/task-store";
import { RemindersList } from "../../components/RemindersList";
import { Card, Chip, MonthGrid, SectionTitle, WeekStrip, kit } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { cancelLocalReminder, listReminders } from "../../lib/native/reminders";
import type { Task } from "../../lib/storage/database";
import { addDays, inboxTasks, REPEAT_LABELS, sameDay, startOfDay, tasksOnDay, timeLabel } from "../../lib/planner/schedule";
import { colors, radii, spacing, typography } from "../../lib/theme";
import { useTabBarSpace } from "../../lib/ui/tab-bar";

type View3 = "week" | "month" | "list";
type Filter = "all" | "pending" | "active" | "snoozed" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "To start" },
  { key: "active", label: "In progress" },
  { key: "snoozed", label: "Snoozed" },
  { key: "done", label: "Done" },
];

function TaskRow({ task, onToggle, onOpen, onMenu }: { task: Task; onToggle: () => void; onOpen: () => void; onMenu: () => void }) {
  const done = task.status === "done";
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        style={styles.iconBtn}
      >
        <Ionicons name={done ? "checkmark-circle" : "ellipse-outline"} size={26} color={done ? colors.success : colors.accent} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.flex} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${task.title}`}>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>{task.title}</Text>
        <View style={styles.meta}>
          {task.project && <Text style={[kit.muted, { color: colors.accent, fontWeight: "600" }]}>{task.project}</Text>}
          {task.dueAt !== null && <Text style={kit.muted}>{timeLabel(new Date(task.dueAt))}</Text>}
          {task.repeat && task.repeat !== "never" && (
            <Text style={kit.muted}><Ionicons name="repeat" size={12} /> {REPEAT_LABELS[task.repeat]}</Text>
          )}
          {task.reminderId && <Text style={kit.muted}><Ionicons name="notifications-outline" size={12} /> Reminder</Text>}
          {done && <Text style={[kit.muted, { color: colors.success }]}>Done</Text>}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onMenu} accessibilityRole="button" accessibilityLabel={`More for ${task.title}`} style={styles.iconBtn}>
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export default function PlanScreen() {
  const router = useRouter();
  const barSpace = useTabBarSpace();
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const updateDetails = useTaskStore((s) => s.updateDetails);
  const removeTask = useTaskStore((s) => s.removeTask);
  const error = useTaskStore((s) => s.error);
  const clearError = useTaskStore((s) => s.clearError);
  const [mode, setMode] = useState<View3>("week");
  const [selected, setSelected] = useState(startOfDay(new Date()));
  const [month, setMonth] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [filter, setFilter] = useState<Filter>("all");
  const [project, setProject] = useState<string | null>(null);
  const [reminders, setReminders] = useState(() => listReminders().upcoming);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
      setReminders(listReminders().upcoming);
    }, [loadTasks]),
  );

  useEffect(() => {
    if (error) Alert.alert("Something went wrong", error, [{ text: "OK", onPress: clearError }]);
  }, [error, clearError]);

  const toggle = (t: Task) => setStatus(t.id, t.status === "done" ? "pending" : "done");
  const open = (t: Task) => router.push(`/task/${t.id}`);
  const menu = (t: Task) =>
    Alert.alert(t.title, undefined, [
      { text: "Edit", onPress: () => router.push({ pathname: "/task/edit", params: { id: t.id } }) },
      {
        text: t.dueAt !== null ? "Move to tomorrow" : "Plan for tomorrow 9:00",
        onPress: () => {
          const base = t.dueAt !== null ? new Date(t.dueAt) : new Date(new Date().setHours(9, 0, 0, 0));
          void updateDetails(t.id, { title: t.title, notes: t.notes, steps: t.steps, repeat: t.repeat, project: t.project, dueAt: addDays(base, 1).getTime(), remind: !!t.reminderId || t.dueAt === null });
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert("Delete this task?", "Its reminder is cancelled too. This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => void removeTask(t.id).catch(() => {}) },
          ]),
      },
      { text: "Close", style: "cancel" },
    ]);

  const dayTasks = tasksOnDay(tasks, selected);
  const dayReminders = reminders.filter((r) => sameDay(new Date(r.at), selected));
  const inbox = inboxTasks(tasks);
  const count = (d: Date) => tasksOnDay(tasks, d).length + reminders.filter((r) => sameDay(new Date(r.at), d)).length;
  const listed = tasks.filter((t) => (filter === "all" || t.status === filter) && (!project || t.project === project));
  const projectNames = [...new Set(tasks.map((t) => t.project).filter((p): p is string => !!p))];

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { paddingBottom: barSpace + 90 }]}>
        <View style={styles.segment} accessibilityRole="tablist">
          {(["week", "month", "list"] as View3[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              style={[styles.segmentItem, mode === m && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, mode === m && styles.segmentTextOn]}>{m === "week" ? "Week" : m === "month" ? "Month" : "List"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === "list" ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[kit.chips, { flexWrap: "nowrap", marginVertical: spacing.lg }]}>
              {FILTERS.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}
            </ScrollView>
            {projectNames.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[kit.chips, { flexWrap: "nowrap", marginBottom: spacing.lg }]}>
                <Chip label="All projects" selected={!project} onPress={() => setProject(null)} />
                {projectNames.map((p) => <Chip key={p} label={p} selected={project === p} onPress={() => setProject(p)} />)}
              </ScrollView>
            )}
            <RemindersList />
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {listed.length === 0 && <Text style={kit.muted}>No tasks here.</Text>}
              {listed.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onOpen={() => open(t)} onMenu={() => menu(t)} />)}
            </View>
          </>
        ) : (
          <>
            <Card style={{ marginTop: spacing.lg }}>
              {mode === "week" ? (
                <>
                  <View style={styles.weekNav}>
                    <TouchableOpacity onPress={() => setSelected(addDays(selected, -7))} accessibilityRole="button" accessibilityLabel="Previous week" style={styles.iconBtn}>
                      <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.monthName}>{selected.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
                    <TouchableOpacity onPress={() => setSelected(addDays(selected, 7))} accessibilityRole="button" accessibilityLabel="Next week" style={styles.iconBtn}>
                      <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <WeekStrip selected={selected} onSelect={setSelected} marks={(d) => count(d) > 0} />
                </>
              ) : (
                <MonthGrid month={month} selected={selected} onMonth={setMonth} onSelect={setSelected} marks={count} />
              )}
            </Card>

            <SectionTitle action={sameDay(selected, new Date()) ? undefined : { label: "Today", onPress: () => { const t = startOfDay(new Date()); setSelected(t); setMonth(new Date(t.getFullYear(), t.getMonth(), 1)); } }}>
              {selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {dayTasks.length === 0 && dayReminders.length === 0 && (
                <Card><Text style={kit.muted}>Nothing planned. That's okay.</Text></Card>
              )}
              {dayReminders.map((r) => (
                <View key={r.id} style={styles.row}>
                  <View style={styles.iconBtn}><Ionicons name="notifications" size={22} color={colors.accent} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.title} numberOfLines={2}>{r.text}</Text>
                    <Text style={kit.muted}>Reminder · {timeLabel(new Date(r.at))}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => { await cancelLocalReminder(r.id); setReminders(listReminders().upcoming); }}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancel reminder ${r.text}`}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
              {dayTasks.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onOpen={() => open(t)} onMenu={() => menu(t)} />)}
            </View>

            <SectionTitle>Sort later</SectionTitle>
            <View style={{ gap: spacing.sm }}>
              {inbox.length === 0 ? (
                <Text style={kit.muted}>Things without a time land here.</Text>
              ) : (
                inbox.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onOpen={() => open(t)} onMenu={() => menu(t)} />)
              )}
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, { bottom: barSpace + spacing.md }]}
        onPress={() => router.push({ pathname: "/task/new", params: { date: String(selected.getTime()) } })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="New task"
      >
        <Ionicons name="add" size={28} color={colors.onAccent} />
      </TouchableOpacity>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segment: { flexDirection: "row", backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, padding: 3 },
  segmentItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.md },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { ...typography.subheadline, color: colors.textSecondary, fontWeight: "600" },
  segmentTextOn: { color: colors.textPrimary },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthName: { ...typography.headline, color: colors.textPrimary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xs,
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  titleDone: { textDecorationLine: "line-through", color: colors.textMuted },
  meta: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap", marginTop: 2 },
  fab: {
    position: "absolute",
    bottom: spacing.xl,
    right: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
