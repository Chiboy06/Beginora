import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { GlassScreen, GlassSurface } from "../components/GlassSurface";
import {
  getUpcomingCalendarEvents,
  type UpcomingCalendarEvent,
} from "../lib/native/calendar";
import {
  getAppointmentReminder,
  scheduleAppointmentReminder,
  type AppointmentReminderLead,
} from "../lib/native/appointment-reminders";
import { colors, radii, spacing, typography } from "../lib/theme";

function eventKey(event: UpcomingCalendarEvent): string {
  return `${event.id}:${event.start}`;
}

export default function CalendarPreparationScreen() {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<UpcomingCalendarEvent[]>([]);
  const [reminded, setReminded] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleReviewCalendar = async () => {
    setLoading(true);
    setReviewed(true);
    setMessage(null);
    try {
      const result = await getUpcomingCalendarEvents(30, 12);
      if (!result.success) {
        setEvents([]);
        setMessage(result.message);
        return;
      }
      setEvents(result.events);
      const saved = await Promise.all(result.events.map(async (event) => [
        eventKey(event), Boolean(await getAppointmentReminder(event)),
      ] as const));
      setReminded(Object.fromEntries(saved));
      if (result.events.length === 0) {
        setMessage("No upcoming appointments were found in the next 30 days. You can add one or keep working on tasks.");
      }
    } catch {
      setEvents([]);
      setMessage("I couldn’t read your calendar just now. You can still add a task manually.");
    } finally {
      setLoading(false);
    }
  };

  const prepareForEvent = (event: UpcomingCalendarEvent) => {
    const when = event.allDay ? "All-day event" : new Date(event.start).toLocaleString();
    router.push({
      pathname: "/task/new",
      params: {
        title: `Prepare for ${event.title}`.slice(0, 200),
        context: `Selected calendar event time: ${when}${event.location ? `; location: ${event.location}` : ""}`.slice(0, 500),
      },
    });
  };

  const scheduleReminder = async (event: UpcomingCalendarEvent, leadMinutes: AppointmentReminderLead) => {
    const key = eventKey(event);
    setBusyKey(key);
    const result = await scheduleAppointmentReminder(event, leadMinutes);
    setMessage(result.message);
    if (result.success) setReminded((current) => ({ ...current, [key]: true }));
    setBusyKey(null);
  };

  const chooseReminder = (event: UpcomingCalendarEvent) => {
    Alert.alert(
      "One appointment reminder",
      "Choose a quiet local notification. Nothing is sent to a service.",
      [
        { text: "15 minutes before", onPress: () => void scheduleReminder(event, 15) },
        { text: "1 hour before", onPress: () => void scheduleReminder(event, 60) },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  return (
    <GlassScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Your schedule, on your device</Text>
        <Text style={styles.heading}>Appointments & prep</Text>
        <Text style={styles.body}>
          Review up to 12 events in the next 30 days. Calendar access is requested only when you tap below; Beginora uses only the event details shown here.
        </Text>

        {!reviewed && (
          <TouchableOpacity style={styles.primaryButton} onPress={handleReviewCalendar} disabled={loading} accessibilityRole="button">
            <Text style={styles.primaryText}>Review my appointments</Text>
          </TouchableOpacity>
        )}
        {loading && <ActivityIndicator style={styles.loader} color={colors.accent} />}
        {!!message && <Text style={styles.message} accessibilityRole="text">{message}</Text>}

        {events.map((event) => {
          const key = eventKey(event);
          return (
            <GlassSurface key={key} style={styles.eventCard}>
              <Text style={styles.eventLabel}>{event.allDay ? "ALL DAY" : "UPCOMING APPOINTMENT"}</Text>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventTime}>{event.allDay ? "All day" : new Date(event.start).toLocaleString()}</Text>
              {!!event.location && <Text style={styles.eventLocation}>{event.location}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => prepareForEvent(event)} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Prepare</Text>
                </TouchableOpacity>
                {!event.allDay && (
                  <TouchableOpacity
                    style={[styles.reminderButton, (reminded[key] || busyKey === key) && styles.disabled]}
                    onPress={() => chooseReminder(event)}
                    disabled={reminded[key] || busyKey === key}
                    accessibilityRole="button"
                  >
                    <Text style={styles.reminderText}>{busyKey === key ? "Setting…" : reminded[key] ? "Reminder set" : "Set reminder"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </GlassSurface>
          );
        })}

        <GlassSurface style={styles.addCard}>
          <Text style={styles.addTitle}>Need to add an appointment?</Text>
          <Text style={styles.bodySmall}>
            Beginora can prepare an event in your device calendar. Your calendar account may sync an event you save. It cannot book with a clinic or provider; use their official booking flow for that.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/appointment/new")} accessibilityRole="button">
            <Text style={styles.primaryText}>Add to device calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButtonWide} onPress={() => router.push("/task/new")} accessibilityRole="button">
            <Text style={styles.secondaryText}>Add a task manually instead</Text>
          </TouchableOpacity>
        </GlassSurface>

        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: 42, gap: spacing.md },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: spacing.sm },
  bodySmall: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  primaryButton: { backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.lg, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  loader: { marginVertical: spacing.md },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginVertical: 3 },
  eventCard: { padding: spacing.lg, borderRadius: radii.xl },
  eventLabel: { color: colors.accent, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginBottom: 7 },
  eventTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700", lineHeight: 25 },
  eventTime: { color: colors.textSecondary, fontSize: 14, marginTop: 6 },
  eventLocation: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  actions: { flexDirection: "row", gap: 9, marginTop: spacing.md },
  secondaryButton: { flex: 1, backgroundColor: "rgba(255,255,255,0.82)", padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  secondaryButtonWide: { backgroundColor: "rgba(255,255,255,0.82)", padding: 13, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginTop: 9 },
  secondaryText: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  reminderButton: { flex: 1, backgroundColor: colors.accentMuted, padding: 12, borderRadius: radii.md, alignItems: "center" },
  reminderText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.65 },
  addCard: { padding: spacing.lg, borderRadius: radii.xl, marginTop: spacing.sm },
  addTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  backButton: { paddingVertical: 12, alignItems: "center" },
  backText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});
