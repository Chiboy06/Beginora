// Mood & journal: a week of moods at a glance and the entries for one day.
// A summary, never a score.

import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button, Card, SectionTitle, WeekStrip, kit } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { getJournalEntries, type JournalEntry } from "../../lib/storage/database";
import { moodFor, MOODS } from "../../lib/planner/moods";
import { addDays, sameDay, startOfDay, startOfWeek, timeLabel } from "../../lib/planner/schedule";
import { colors, radii, spacing, typography } from "../../lib/theme";

export default function JournalScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selected, setSelected] = useState(startOfDay(new Date()));

  useFocusEffect(
    useCallback(() => {
      // Ten weeks back is enough for the strip and the summary.
      getJournalEntries(addDays(startOfDay(new Date()), -70).getTime()).then(setEntries).catch(() => setEntries([]));
    }, []),
  );

  const onDay = entries.filter((e) => sameDay(new Date(e.createdAt), selected));
  const week = entries.filter((e) => e.createdAt >= startOfWeek(selected).getTime() && e.createdAt < addDays(startOfWeek(selected), 7).getTime());
  const counts = MOODS.map((m) => ({ mood: m, n: week.filter((e) => e.mood === m.key).length })).filter((c) => c.n > 0);
  const tags = [...new Set(week.flatMap((e) => e.tags).filter((t) => t !== "Routine"))].slice(0, 8);

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={kit.screenPad}>
        <Card>
          <View style={styles.nav}>
            <Button label="‹ Week" kind="quiet" onPress={() => setSelected(addDays(selected, -7))} />
            <Button label="Week ›" kind="quiet" onPress={() => setSelected(addDays(selected, 7))} />
          </View>
          <WeekStrip
            selected={selected}
            onSelect={setSelected}
            marks={(d) => moodFor(entries.find((e) => e.mood && sameDay(new Date(e.createdAt), d))?.mood)?.emoji ?? false}
          />
        </Card>

        <Button label="How was your day?" icon="add" onPress={() => router.push("/journal/new")} style={{ marginTop: spacing.lg }} />

        <SectionTitle>{selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
        {onDay.length === 0 && <Text style={kit.muted}>Nothing written this day.</Text>}
        <View style={{ gap: spacing.sm }}>
          {onDay.map((e) => {
            const m = moodFor(e.mood);
            return (
              <TouchableOpacity key={e.id} onPress={() => router.push({ pathname: "/journal/new", params: { id: e.id } })} accessibilityRole="button" style={styles.entry}>
                <Text style={styles.emoji}>{m?.emoji ?? "📝"}</Text>
                <View style={styles.flex}>
                  <Text style={styles.title}>{e.title || m?.label || "Entry"}</Text>
                  {!!e.body && <Text style={kit.muted} numberOfLines={2}>{e.body}</Text>}
                  <Text style={kit.muted}>{timeLabel(new Date(e.createdAt))}{e.tags.length ? ` · ${e.tags.join(", ")}` : ""}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {counts.length > 0 && (
          <>
            <SectionTitle>This week</SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              <View style={kit.chips}>
                {counts.map(({ mood, n }) => (
                  <View key={mood.key} style={styles.count}><Text style={styles.countText}>{mood.emoji} {mood.label} ×{n}</Text></View>
                ))}
              </View>
              {tags.length > 0 && <Text style={kit.muted}>What helped: {tags.join(", ")}</Text>}
            </Card>
          </>
        )}
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nav: { flexDirection: "row", justifyContent: "space-between" },
  entry: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  emoji: { fontSize: 30 },
  title: { ...typography.headline, color: colors.textPrimary },
  count: { paddingHorizontal: 12, minHeight: 34, justifyContent: "center", borderRadius: radii.full, backgroundColor: colors.accentMuted },
  countText: { ...typography.subheadline, color: colors.textPrimary, fontWeight: "600" },
});
