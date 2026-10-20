import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useOnboardingStore } from "../lib/store/onboarding-store";
import { colors, radii, spacing, typography } from "../lib/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = useOnboardingStore((s) => s.complete);

  const handleContinue = () => {
    completeOnboarding();
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.wordmark}>Beginora</Text>
        <Text style={styles.tagline}>One small step to get started.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What Beginora does</Text>
          <Text style={styles.cardBody}>
            You tell Beginora what you want to work on. It finds one concrete first action — something you can start in about 30 seconds and do in about five minutes.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your data and connections</Text>
          <Text style={styles.cardBody}>
            Tasks, plans, and activity are stored locally in this prototype. Optional services send only the information you choose to share with them. Android voice input uses your selected system speech provider, whose online and retention behavior is controlled by that provider.
          </Text>
        </View>

        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Important</Text>
          <Text style={styles.disclaimerBody}>
            Beginora is a planning and focus aid, not medical care. It does not diagnose or treat ADHD or any other condition, and it does not replace professional support.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="I understand — get started"
        >
          <Text style={styles.btnText}>I understand — get started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: 64, paddingBottom: 24 },
  wordmark: { ...typography.heading, fontSize: 34, color: colors.accent, marginBottom: 8 },
  tagline: { fontSize: 18, color: colors.textSecondary, marginBottom: 40, lineHeight: 26 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  cardBody: { fontSize: 15, color: colors.textSecondary, lineHeight: 23 },
  disclaimerCard: {
    backgroundColor: colors.accentMuted,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  disclaimerTitle: { fontSize: 14, fontWeight: "700", color: colors.accent, marginBottom: 8 },
  disclaimerBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  footer: {
    padding: spacing.xl,
    paddingBottom: 36,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: "700" },
});
