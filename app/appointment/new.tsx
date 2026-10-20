import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { createEventInCalendarAsync, isAvailableAsync } from "expo-calendar/legacy";
import { useRouter } from "expo-router";
import { GlassScreen, GlassSurface } from "../../components/GlassSurface";
import { createEvent } from "../../lib/native/system-actions";
import { colors, radii, spacing, typography } from "../../lib/theme";

export default function NewAppointmentScreen() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [proposedStart, setProposedStart] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setProposedStart(new Date(Date.now() + 60 * 60 * 1000)), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleOpenEditor = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMessage("Add a short appointment title first.");
      return;
    }
    if (!proposedStart) {
      setMessage("Preparing a suggested time. Please try again in a moment.");
      return;
    }
    if (busy) return;

    setBusy(true);
    setMessage(null);
    const proposedEnd = new Date(proposedStart.getTime() + 60 * 60 * 1000);
    try {
      if (Platform.OS === "android") {
        const result = await createEvent(
          trimmedTitle.slice(0, 160),
          proposedStart.toISOString(),
          proposedEnd.toISOString(),
          location.trim().slice(0, 200),
        );
        setMessage(result.message);
      } else if (await isAvailableAsync()) {
        const result = await createEventInCalendarAsync({
          title: trimmedTitle.slice(0, 160),
          startDate: proposedStart,
          endDate: proposedEnd,
          location: location.trim().slice(0, 200),
        });
        setMessage(result.action === "saved"
          ? "The event was saved to your device calendar."
          : "The calendar editor closed. Check your calendar to see whether the event was saved.");
      } else {
        setMessage("A device calendar editor isn’t available here. You can still add the appointment as a task.");
      }
    } catch {
      setMessage("I couldn’t open the calendar editor. Your appointment details remain on this screen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>You choose what gets saved</Text>
        <Text style={styles.heading}>Add an appointment</Text>
        <Text style={styles.intro}>
          Beginora prepares an event in your device calendar. The calendar account may sync events you save; this does not book with a clinic, therapist, or other provider.
        </Text>
        <GlassSurface style={styles.form}>
          <Text style={styles.label}>Appointment</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Dentist appointment"
            placeholderTextColor={colors.textMuted}
            maxLength={160}
            accessibilityLabel="Appointment title"
          />
          <Text style={styles.label}>Location (optional)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Address or provider name"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
            accessibilityLabel="Appointment location"
          />
          <Text style={styles.timeLabel}>Suggested time</Text>
          <Text style={styles.timeValue}>{proposedStart ? proposedStart.toLocaleString() : "Preparing a suggested time…"}</Text>
          <Text style={styles.helper}>The calendar editor opens next. Adjust the date and time there before choosing Save.</Text>
          {!!message && <Text style={styles.message} accessibilityRole="text">{message}</Text>}
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={handleOpenEditor}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Open the device calendar event editor"
          >
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Continue to calendar</Text>}
          </TouchableOpacity>
        </GlassSurface>
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: 42 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: 6, marginBottom: 8 },
  intro: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: spacing.lg },
  form: { padding: spacing.lg, borderRadius: radii.xl, gap: 8 },
  label: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 6 },
  input: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.field, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15 },
  timeLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 8 },
  timeValue: { color: colors.accent, fontSize: 16, fontWeight: "700", marginTop: 2 },
  helper: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 7 },
  primaryButton: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  cancelButton: { paddingVertical: 15, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
});
