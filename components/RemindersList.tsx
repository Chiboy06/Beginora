import { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { cancelLocalReminder, listReminders } from "../lib/native/reminders";
import { colors, radii, spacing, typography } from "../lib/theme";

const when = (at: number) =>
  new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Upcoming reminders (with Cancel) and the most recent past ones.
export function RemindersList() {
  const [lists, setLists] = useState(() => listReminders());
  const refresh = useCallback(() => setLists(listReminders()), []);

  useFocusEffect(refresh);
  // Move reminders from Upcoming to Past as their time passes.
  useEffect(() => {
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const cancel = (id: string, text: string) => {
    Alert.alert("Cancel this reminder?", text, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel reminder",
        style: "destructive",
        onPress: () => {
          void cancelLocalReminder(id).then((ok) => {
            if (!ok) Alert.alert("Not cancelled", "Android did not cancel this reminder. Try again.");
            refresh();
          });
        },
      },
    ]);
  };

  if (lists.upcoming.length === 0 && lists.past.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Reminders</Text>
      {lists.upcoming.map((r) => (
        <View key={r.id} style={styles.row}>
          <Ionicons name="alarm-outline" size={20} color={colors.accent} />
          <View style={styles.body}>
            <Text style={styles.text} numberOfLines={2}>{r.text}</Text>
            <Text style={styles.time}>{when(r.at)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => cancel(r.id, r.text)}
            style={styles.cancel}
            accessibilityRole="button"
            accessibilityLabel={`Cancel reminder: ${r.text}`}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ))}
      {lists.past.length > 0 && <Text style={styles.subheading}>Past</Text>}
      {lists.past.map((r) => (
        <View key={r.id} style={[styles.row, styles.pastRow]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={colors.textMuted} />
          <View style={styles.body}>
            <Text style={[styles.text, styles.pastText]} numberOfLines={2}>{r.text}</Text>
            <Text style={styles.time}>{when(r.at)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  heading: { ...typography.footnote, color: colors.textMuted, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: spacing.sm, marginLeft: spacing.sm },
  subheading: { ...typography.footnote, color: colors.textMuted, fontWeight: "600", marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  pastRow: { backgroundColor: colors.surfaceMuted },
  body: { flex: 1 },
  text: { ...typography.callout, color: colors.textPrimary },
  pastText: { color: colors.textSecondary },
  time: { ...typography.footnote, color: colors.textMuted, marginTop: 2 },
  cancel: { minHeight: 44, minWidth: 64, justifyContent: "center", alignItems: "flex-end" },
  cancelText: { ...typography.callout, color: colors.accent, fontWeight: "600" },
});
