import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GlassScreen, GlassSurface } from "../components/GlassSurface";
import { openEmailDraft, validateEmailDraft } from "../lib/connectors/email-connector";
import { colors, radii, spacing, typography } from "../lib/theme";

export default function EmailDraftScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ subject?: string; body?: string }>();
  const [recipients, setRecipients] = useState("");
  const [subject, setSubject] = useState((params.subject ?? "").slice(0, 200));
  const [body, setBody] = useState((params.body ?? "").slice(0, 12000));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openComposer = async () => {
    const draft = {
      recipients: recipients.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
      subject,
      body,
    };
    const validationError = validateEmailDraft(draft);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await openEmailDraft(draft);
    setMessage(result.message);
    setBusy(false);
  };

  return (
    <GlassScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>A private handoff</Text>
        <Text style={styles.heading}>Draft an email</Text>
        <Text style={styles.intro}>
          Beginora prepares an editable draft in your email app. Nothing is sent until you review and press Send there.
        </Text>
        <GlassSurface style={styles.form}>
          <Text style={styles.label}>To (optional)</Text>
          <TextInput
            style={styles.input}
            value={recipients}
            onChangeText={setRecipients}
            placeholder="name@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Email recipient, optional"
          />
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="What is this email about?"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
            accessibilityLabel="Email subject"
          />
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={body}
            onChangeText={setBody}
            placeholder="Write a few words to get started…"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={12000}
            accessibilityLabel="Email message"
          />
          {!!message && <Text style={styles.message}>{message}</Text>}
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={openComposer}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Open email app with this editable draft"
          >
            <Text style={styles.primaryText}>{busy ? "Opening your email app…" : "Review in email app"}</Text>
          </TouchableOpacity>
        </GlassSurface>
        <View style={styles.handoffNote}>
          <Text style={styles.noteText}>Recipients and message text are not saved in Beginora. Your mail provider may sync them after you send.</Text>
        </View>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: 44 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase", marginTop: spacing.sm },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: 6, marginBottom: 8 },
  intro: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: spacing.lg },
  form: { padding: spacing.lg, borderRadius: radii.xl, gap: 8 },
  label: { color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 6 },
  input: { minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.82)", paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15 },
  messageInput: { minHeight: 180, textAlignVertical: "top" },
  primaryButton: { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 15, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  handoffNote: { marginTop: spacing.md, paddingHorizontal: 4 },
  noteText: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  cancelButton: { paddingVertical: 16, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: "600" },
});
