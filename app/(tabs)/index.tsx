// Today: what matters now. One greeting, the next thing, one first step, up to
// three tasks and one way to capture something. Nothing urgent shows as calm.

import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassScreen } from "../../components/GlassSurface";
import { Button, Card, MoodPicker, SectionTitle, kit } from "../../components/Kit";
import { useTaskStore } from "../../lib/store/task-store";
import { prefs } from "../../lib/store/prefs";
import { listReminders, cancelLocalReminder } from "../../lib/native/reminders";
import { getJournalEntries, type JournalEntry } from "../../lib/storage/database";
import { dayLabel, daysBetween, doneToday, sameDay, startOfDay, timeLabel } from "../../lib/planner/schedule";
import { moodFor } from "../../lib/planner/moods";
import { colors, radii, spacing, typography } from "../../lib/theme";

const AWAY_DAYS = 3;

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const [now, setNow] = useState(new Date());
  const [reminders, setReminders] = useState(() => listReminders().upcoming);
  const [todayMood, setTodayMood] = useState<JournalEntry | null>(null);
  // Read once per launch, before it is updated below.
  const [awayDays] = useState(() => (prefs.lastOpenedAt ? daysBetween(prefs.lastOpenedAt, Date.now()) : 0));
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    prefs.lastOpenedAt = Date.now();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      void loadTasks();
      setReminders(listReminders().upcoming);
      getJournalEntries(startOfDay(new Date()).getTime())
        .then((entries) => setTodayMood(entries.find((e) => e.mood) ?? null))
        .catch(() => setTodayMood(null));
    }, [loadTasks]),
  );

  const open = tasks.filter((t) => t.status !== "done");
  const dueToday = open.filter((t) => t.dueAt !== null && sameDay(new Date(t.dueAt), now)).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const later = open.filter((t) => !dueToday.includes(t));
  const shown = [...dueToday, ...later].slice(0, 3);
  const nextTask = open.filter((t) => t.dueAt !== null && t.dueAt > now.getTime()).sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0];
  const nextReminder = reminders[0];
  const upNext = nextReminder && (!nextTask || nextReminder.at < (nextTask.dueAt ?? Infinity))
    ? { kind: "reminder" as const, title: nextReminder.text, at: nextReminder.at, id: nextReminder.id }
    : nextTask ? { kind: "task" as const, title: nextTask.title, at: nextTask.dueAt ?? 0, id: nextTask.id } : null;
  const firstStep = open.find((t) => t.status === "active" && t.firstAction) ?? open.find((t) => t.firstAction);
  const done = doneToday(tasks, now);
  const name = prefs.userName;
  const minutesAway = upNext ? Math.round((upNext.at - now.getTime()) / 60_000) : 0;

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={kit.h1} accessibilityRole="header">{greeting(now.getHours())}{name ? `, ${name}` : ""}</Text>
        <Text style={kit.sub}>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}. One step at a time.</Text>

        {awayDays >= AWAY_DAYS && !welcomeDismissed && (
          <Card style={styles.welcome}>
            <Text style={styles.cardTitle}>Welcome back.</Text>
            <Text style={styles.cardBody}>Your tasks are still here. Nothing is overdue in a bad way; let's just see what matters today.</Text>
            <View style={styles.row}>
              <Button label="Reset my day" kind="secondary" onPress={() => router.push("/reset")} style={styles.flex} />
              <Button label="Got it" kind="quiet" onPress={() => setWelcomeDismissed(true)} />
            </View>
          </Card>
        )}

        <SectionTitle>Up next</SectionTitle>
        {upNext ? (
          <Card>
            <Text style={styles.eyebrow}>{dayLabel(new Date(upNext.at), now)} · {timeLabel(new Date(upNext.at))}{minutesAway > 0 && minutesAway < 120 ? ` · in ${minutesAway} min` : ""}</Text>
            <Text style={styles.cardTitle}>{upNext.title}</Text>
            <View style={styles.row}>
              {upNext.kind === "task" ? (
                <Button label="View" kind="secondary" icon="open-outline" onPress={() => router.push(`/task/${upNext.id}`)} style={styles.flex} />
              ) : (
                <Button
                  label="Cancel reminder"
                  kind="secondary"
                  onPress={async () => {
                    await cancelLocalReminder(upNext.id);
                    setReminders(listReminders().upcoming);
                  }}
                  style={styles.flex}
                />
              )}
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={styles.cardTitle}>Nothing urgent right now.</Text>
            <Text style={styles.cardBody}>You have some breathing room.</Text>
          </Card>
        )}

        {firstStep && (
          <>
            <SectionTitle>Your first step</SectionTitle>
            <Card style={styles.firstStep}>
              <Text style={styles.eyebrow}>{firstStep.title}</Text>
              <Text style={styles.stepText}>{firstStep.firstAction}</Text>
              <Button
                label="Start 10 minutes"
                icon="play"
                onPress={() => router.push({ pathname: "/task/focus", params: { id: firstStep.id, minutes: "10" } })}
              />
            </Card>
          </>
        )}

        <SectionTitle action={{ label: "See all", onPress: () => router.push("/tasks") }}>Today</SectionTitle>
        {shown.length === 0 ? (
          <Card><Text style={styles.cardBody}>No tasks yet. Tap Capture to add one.</Text></Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {shown.map((t) => (
              <TouchableOpacity key={t.id} onPress={() => router.push(`/task/${t.id}`)} accessibilityRole="button" style={styles.taskRow}>
                <TouchableOpacity
                  onPress={() => setStatus(t.id, "done")}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: false }}
                  accessibilityLabel={`Mark ${t.title} as done`}
                  style={styles.check}
                >
                  <Ionicons name="ellipse-outline" size={26} color={colors.accent} />
                </TouchableOpacity>
                <View style={styles.flex}>
                  <Text style={styles.taskTitle} numberOfLines={2}>{t.title}</Text>
                  {t.dueAt !== null && <Text style={kit.muted}>{dayLabel(new Date(t.dueAt), now)} · {timeLabel(new Date(t.dueAt))}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {done > 0 && <Text style={styles.progress}>You've done {done} {done === 1 ? "thing" : "things"} today. Every small step counts.</Text>}

        <SectionTitle action={{ label: "Journal", onPress: () => router.push("/journal") }}>How is your day?</SectionTitle>
        {todayMood ? (
          <Card>
            <Text style={styles.cardTitle}>{moodFor(todayMood.mood)?.emoji} {moodFor(todayMood.mood)?.label}</Text>
            <Text style={styles.cardBody}>{todayMood.title || todayMood.body || "Saved for today."}</Text>
          </Card>
        ) : (
          <MoodPicker
            value={null}
            keys={["great", "good", "okay", "tired", "stressed"]}
            onChange={(mood) => router.push({ pathname: "/journal/new", params: { mood } })}
          />
        )}

        <SectionTitle>Tools</SectionTitle>
        <View style={styles.tools}>
          {[
            { label: "Routines", icon: "repeat" as const, to: "/routines" },
            { label: "Focus", icon: "timer-outline" as const, to: "/task/focus" },
            { label: "Talk", icon: "chatbubble-ellipses-outline" as const, to: "/talk" },
            { label: "Reset my day", icon: "leaf-outline" as const, to: "/reset" },
          ].map((tool) => (
            <TouchableOpacity key={tool.label} onPress={() => router.push(tool.to as never)} accessibilityRole="button" style={styles.tool}>
              <Ionicons name={tool.icon} size={24} color={colors.accent} />
              <Text style={styles.toolText}>{tool.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <TouchableOpacity
        onPress={() => router.push("/capture")}
        accessibilityRole="button"
        accessibilityLabel="Capture something to remember"
        style={styles.capture}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={24} color={colors.onAccent} />
        <Text style={styles.captureText}>Capture</Text>
      </TouchableOpacity>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center" },
  welcome: { marginTop: spacing.lg, backgroundColor: colors.accentMuted, borderColor: colors.accentSoft },
  eyebrow: { ...typography.footnote, color: colors.accent, fontWeight: "700", marginBottom: 4 },
  cardTitle: { ...typography.title3, color: colors.textPrimary },
  cardBody: { ...typography.callout, color: colors.textSecondary, marginTop: 4 },
  firstStep: { gap: spacing.md },
  stepText: { ...typography.title3, color: colors.textPrimary, lineHeight: 27 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  check: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  taskTitle: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  progress: { ...typography.subheadline, color: colors.success, marginTop: spacing.md, fontWeight: "600" },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tool: {
    flexGrow: 1,
    width: "45%",
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  toolText: { ...typography.callout, color: colors.textPrimary, fontWeight: "600" },
  capture: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  captureText: { ...typography.headline, color: colors.onAccent },
});
