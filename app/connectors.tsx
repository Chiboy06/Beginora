import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { GlassScreen, GlassSurface } from "../components/GlassSurface";
import { listConnectors } from "../lib/connectors/registry";
import { readConnectorPermissionStates } from "../lib/connectors/permission-service";
import type { ConnectorPermissionState } from "../lib/connectors/types";
import { colors, radii, spacing, typography } from "../lib/theme";

const ROUTES: Record<string, string> = {
  "device-calendar": "/calendar",
  "local-reminders": "/calendar",
  "email-composer": "/email",
  "local-documents": "/documents",
  "on-device-model": "/models",
  "paired-mcp": "/mcp",
};

const STATUS: Record<ConnectorPermissionState, string> = {
  unavailable: "Unavailable on this device",
  available: "Ready",
  not_requested: "Not requested",
  granted: "Allowed",
  denied: "Not allowed",
  revoked: "Permission removed",
};

export default function ConnectorsScreen() {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, ConnectorPermissionState>>({});

  const refresh = useCallback(() => {
    readConnectorPermissionStates().then(setStates).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <GlassScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Your connections</Text>
        <Text style={styles.intro}>
          Beginora connects only when you choose an action. Calendar and reminders stay on this device; email opens your mail app for you to review.
        </Text>
        {listConnectors().map((connector) => (
          <TouchableOpacity
            key={connector.id}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`${connector.displayName}. ${STATUS[states[connector.id] ?? connector.permissionState]}. Open details.`}
            onPress={() => router.push(ROUTES[connector.id] as never)}
          >
            <GlassSurface style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{connector.displayName}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{STATUS[states[connector.id] ?? connector.permissionState]}</Text>
                </View>
              </View>
              <Text style={styles.description}>{connector.description}</Text>
              <Text style={styles.detail}>{connector.userControl}</Text>
              <Text style={styles.capabilities}>
                {connector.offline ? "Works offline" : "May need internet"} · {connector.capabilities.join(" · ")}
              </Text>
            </GlassSurface>
          </TouchableOpacity>
        ))}
        <GlassSurface style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>You stay in control</Text>
          <Text style={styles.description}>
            No background monitoring. Beginora never sends an email or saves a calendar appointment by itself. You can continue using tasks and the local model if any permission is denied.
          </Text>
        </GlassSurface>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: 44, gap: spacing.md },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
  intro: { color: colors.textSecondary, fontSize: 15, lineHeight: 23, marginBottom: spacing.sm },
  card: { padding: spacing.lg, borderRadius: radii.xl },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  badge: { borderRadius: radii.full, backgroundColor: colors.accentMuted, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  detail: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 8 },
  capabilities: { color: colors.textMuted, fontSize: 11, marginTop: 10 },
  privacyCard: { padding: spacing.lg, borderRadius: radii.xl, marginTop: spacing.sm },
  privacyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 6 },
});
