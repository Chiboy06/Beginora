// Reset my day: for when the list feels like too much. Nothing is deleted or
// moved without a tap.

import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button, Card, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { useTaskStore } from "../lib/store/task-store";
import { addDays, dayLabel, sameDay, timeLabel } from "../lib/planner/schedule";
import type { Task } from "../lib/storage/database";
import { colors, radii, spacing, typography } from "../lib/theme";

const OLD_MS = 7 * 24 * 60 * 60 * 1000;

type Mode = "today" | "one" | "clear" | null;

export default function ResetScreen() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const updateDetails = useTaskStore((s) => s.updateDetails);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [mode, setMode] = useState<Mode>(null);

  useFocusEffect(useCallback(() => { void loadTasks(); }, [loadTasks]));

  const now = new Date();
  const open = tasks.filter((t) => t.status !== "done");
  const today = open.filter((t) => t.dueAt !== null && sameDay(new Date(t.dueAt), now));
  const pickFrom = [...open.filter((t) => t.firstAction), ...open.filter((t) => !t.firstAction)].slice(0, 3);
  const stale = open.filter((t) => (t.dueAt !== null && t.dueAt < now.getTime() - 60 * 60_000) || (t.dueAt === null && now.getTime() - t.createdAt > OLD_MS));

  const tomorrow = (t: Task) => {
    const base = t.dueAt !== null ? new Date(t.dueAt) : new Date(new Date().setHours(9, 0, 0, 0));
    const next = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), base.getHours(), base.getMinutes()), 1);
    void updateDetails(t.id, { title: t.title, notes: t.notes, steps: t.steps, repeat: t.repeat, dueAt: next.getTime(), remind: !!t.reminderId });
  };

  const option = (key: Exclude<Mode, null>, title: string, body: string) => (
    <TouchableOpacity
      onPress={() => setMode(mode === key ? null : key)}
      accessibilityRole="button"
      accessibilityState={{ expanded: mode === key }}
      style={[styles.option, mode === key && styles.optionOn]}
    >
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={kit.muted}>{body}</Text>
    </TouchableOpacity>
  );

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]}>
        <Text style={kit.h1} accessibilityRole="header">Feeling overwhelmed?</Text>
        <Text style={kit.sub}>You don't have to sort everything out at once. Pick one way in.</Text>

        {option("today", "Show me what matters today", "Only what's due today.")}
        {mode === "today" && (
          <Card style={{ gap: spacing.sm }}>
            {today.length === 0 ? <Text style={kit.body}>Nothing is due today. Keep it simple.</Text> : today.map((t) => (
              <TouchableOpacity key={t.id} onPress={() => router.push(`/task/${t.id}`)} accessibilityRole="button" style={styles.item}>
                <Text style={kit.body}>{t.title}</Text>
                {t.dueAt !== null && <Text style={kit.muted}>{timeLabel(new Date(t.dueAt))}</Text>}
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {option("one", "Help me pick one thing", "Three choices, no more.")}
        {mode === "one" && (
          <Card style={{ gap: spacing.sm }}>
            {pickFrom.length === 0 ? <Text style={kit.body}>Your list is empty. That's a good place to be.</Text> : pickFrom.map((t) => (
              <TouchableOpacity key={t.id} onPress={() => router.push(`/task/${t.id}`)} accessibilityRole="button" style={styles.item}>
                <Text style={kit.body}>{t.title}</Text>
                {t.firstAction && <Text style={kit.muted}>First step: {t.firstAction}</Text>}
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {option("clear", "Help me clear my list", "Old or missed items: keep, move or let go.")}
        {mode === "clear" && (
          <View style={{ gap: spacing.sm }}>
            {stale.length === 0 && <Card><Text style={kit.body}>Nothing old is waiting. Well done.</Text></Card>}
            {stale.map((t) => (
              <Card key={t.id} style={{ gap: spacing.sm }}>
                <Text style={kit.body}>{t.title}</Text>
                <Text style={kit.muted}>{t.dueAt !== null ? `Was for ${dayLabel(new Date(t.dueAt))}` : "No time set"}</Text>
                <View style={styles.actions}>
                  <Button label="Done" kind="secondary" onPress={() => setStatus(t.id, "done")} style={styles.flex} />
                  <Button label="Tomorrow" kind="secondary" onPress={() => tomorrow(t)} style={styles.flex} />
                  <Button
                    label="Let go"
                    kind="danger"
                    onPress={() => Alert.alert("Delete this task?", t.title, [
                      { text: "Keep it", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void removeTask(t.id).catch(() => {}) },
                    ])}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}

        <SectionTitle>Or calm down first</SectionTitle>
        <Button label="Reset routine: breathe, water, one thing" kind="secondary" icon="leaf-outline" onPress={() => router.push("/routines")} />
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderLight, gap: 4 },
  optionOn: { borderColor: colors.accent, borderWidth: 2 },
  optionTitle: { ...typography.headline, color: colors.textPrimary },
  item: { minHeight: 48, justifyContent: "center", paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  actions: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
});
