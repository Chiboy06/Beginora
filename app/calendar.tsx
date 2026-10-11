import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { getNextCalendarEvent, type UpcomingCalendarEvent } from "../lib/native/calendar";
import { colors, radii, spacing, typography } from "../lib/theme";

export default function CalendarPreparationScreen() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState<UpcomingCalendarEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleCheckCalendar = async () => {
    setLoading(true);
    setChecked(true);
    setMessage(null);
    try {
      const result = await getNextCalendarEvent();
      if (!result.success) {
        setMessage(result.message);
        setEvent(null);
      } else if (!result.event) {
        setMessage("There isn’t an upcoming event in the next 30 days. You can add a task manually.");
        setEvent(null);
      } else {
        setEvent(result.event);
      }
    } catch {
      setMessage("I couldn’t read the calendar just now. You can add a task manually instead.");
      setEvent(null);
    } finally {
      setLoading(false);
    }
  };

  const prepareForEvent = (selected: UpcomingCalendarEvent) => {
    const when = selected.allDay
      ? "All-day event"
      : new Date(selected.start).toLocaleString();
    router.push({
      pathname: "/task/new",
      params: {
        title: `Prepare for ${selected.title}`.slice(0, 200),
        context: `Calendar event time: ${when}`.slice(0, 500),
      },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Prepare for your next event</Text>
      <Text style={styles.body}>
        If you choose to continue, Beginora will look only for your next event and use its title and time to help you prepare. Calendar access is optional; your task flow works without it.
      </Text>

      {!checked && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleCheckCalendar}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Check my calendar</Text>
        </TouchableOpacity>
      )}

      {loading && <ActivityIndicator style={styles.loader} color={colors.accent} />}
      {message && <Text style={styles.message}>{message}</Text>}

      {event && (
        <View style={styles.eventCard}>
          <Text style={styles.eventLabel}>NEXT EVENT</Text>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventTime}>
            {event.allDay ? "All day" : new Date(event.start).toLocaleString()}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => prepareForEvent(event)} accessibilityRole="button">
            <Text style={styles.primaryText}>Prepare for this</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push("/task/new")}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryText}>Add a task manually instead</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton} accessibilityRole="button">
        <Text style={styles.cancelText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl },
  heading: { ...typography.heading, color: colors.textPrimary, marginBottom: 10 },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: 22 },
  primaryButton: { backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.md, alignItems: "center", marginTop: 12 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: colors.surface, padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginTop: 12 },
  secondaryText: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  cancelButton: { paddingVertical: 14, alignItems: "center" },
  cancelText: { color: colors.textMuted, fontSize: 14 },
  eventCard: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: 10 },
  eventLabel: { color: colors.accent, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginBottom: 8 },
  eventTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "600", lineHeight: 25 },
  eventTime: { color: colors.textSecondary, fontSize: 14, marginTop: 6 },
  loader: { marginVertical: 18 },
  message: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 16 },
});
