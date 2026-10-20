import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { GlassScreen, GlassSurface } from "../components/GlassSurface";
import { listConnectors } from "../lib/connectors/registry";
import {
  readConnectorPermissionStates,
  requestConnectorPermission,
  REQUESTABLE_CONNECTORS,
} from "../lib/connectors/permission-service";
import { hasUsageAccess, openUsageAccessSettings } from "../lib/native/usage-access";
import { allowOnTimeReminders, onTimeRemindersAllowed } from "../lib/native/reminders";
import type { ConnectorPermissionState } from "../lib/connectors/types";
import { colors, radii, spacing, typography } from "../lib/theme";

const ROUTES: Record<string, string> = {
  "device-calendar": "/calendar",
  "device-contacts": "/connectors",
  "android-voice-input": "/connectors",
  "local-reminders": "/calendar",
  "background-model": "/settings",
  "telegram-task-summaries": "/settings",
  "app-updates": "/settings",
  "email-composer": "/email",
  "local-documents": "/documents",
  "on-device-model": "/models",
  "paired-mcp": "/mcp",
};

const STATUS: Record<ConnectorPermissionState, string> = {
  unavailable: "Unavailable on this device",
  available: "Ready",
  not_requested: "Not requested",
  not_granted: "Not granted; requested when used",
  disabled: "Configured but disabled",
  granted: "Allowed",
  denied: "Not allowed",
  revoked: "Permission removed",
};

export default function ConnectorsScreen() {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, ConnectorPermissionState>>({});

  const [usageGranted, setUsageGranted] = useState(false);
  const [onTime, setOnTime] = useState(true);

  const refresh = useCallback(() => {
    readConnectorPermissionStates().then(setStates).catch(() => {});
    void hasUsageAccess().then(setUsageGranted);
    void onTimeRemindersAllowed().then(setOnTime).catch(() => setOnTime(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  // Grants made in Android settings show up as soon as the user comes back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const allow = async (id: string) => {
    const state = await requestConnectorPermission(id).catch(() => null);
    if (state === "denied") {
      Alert.alert("Turn it on in Settings", "Android won't ask again for this permission. Open settings, tap Permissions, and allow it.", [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => { void Linking.openSettings(); } },
      ]);
    }
    refresh();
  };

  const openBatterySettings = () => {
    Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(() => { void Linking.openSettings(); });
  };

  return (
    <GlassScreen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Your connections</Text>
        <Text style={styles.intro}>
          Tap Allow on anything you want Beginora to use. Everything is optional: tasks and the on-device model work with every permission off. Local reminders stay on this device; a calendar account may sync events you save, and email or Telegram receives only the content you choose to send.
        </Text>
        {Platform.OS === "android" && (
          <GlassSurface style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Phone-use patterns</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{usageGranted ? "Allowed" : "Not allowed"}</Text>
              </View>
            </View>
            <Text style={styles.description}>Lets gentle check-ins notice long scrolling or rapid app switching. App names and times only, kept on this phone. Find Beginora in the list and switch it on.</Text>
            {!usageGranted && (
              <TouchableOpacity style={styles.action} onPress={() => { void openUsageAccessSettings().catch(() => {}); }} accessibilityRole="button">
                <Text style={styles.actionText}>Open usage access</Text>
              </TouchableOpacity>
            )}
          </GlassSurface>
        )}
        {Platform.OS === "android" && (
          <GlassSurface style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>On-time reminders</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{onTime ? "Allowed" : "Not allowed"}</Text>
              </View>
            </View>
            <Text style={styles.description}>Lets reminders ring at the exact minute you set. Without it, Android may deliver them late to save battery.</Text>
            {!onTime && (
              <TouchableOpacity style={styles.action} onPress={() => { void allowOnTimeReminders().then(setOnTime).catch(() => {}); }} accessibilityRole="button">
                <Text style={styles.actionText}>Allow on-time reminders</Text>
              </TouchableOpacity>
            )}
          </GlassSurface>
        )}
        {Platform.OS === "android" && (
          <GlassSurface style={styles.card}>
            <Text style={styles.cardTitle}>Run in the background</Text>
            <Text style={[styles.description, { marginTop: 8 }]}>Some phones stop apps in the background to save battery, which delays check-ins and Telegram replies. In the list, choose Beginora and allow it (on Samsung: Battery, then Unrestricted).</Text>
            <TouchableOpacity style={styles.action} onPress={openBatterySettings} accessibilityRole="button">
              <Text style={styles.actionText}>Open battery settings</Text>
            </TouchableOpacity>
          </GlassSurface>
        )}
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
              {REQUESTABLE_CONNECTORS.has(connector.id) && ["not_requested", "not_granted", "denied"].includes(states[connector.id] ?? "") && (
                <TouchableOpacity
                  style={styles.action}
                  onPress={() => { void allow(connector.id); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Allow ${connector.displayName}`}
                >
                  <Text style={styles.actionText}>{states[connector.id] === "denied" ? "Open settings" : "Allow"}</Text>
                </TouchableOpacity>
              )}
            </GlassSurface>
          </TouchableOpacity>
        ))}
        <GlassSurface style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>You stay in control</Text>
          <Text style={styles.description}>
            Background check-ins and phone-use patterns run only if you switch them on. Beginora never sends an email, text or calendar appointment by itself. You can keep using tasks and the local model with any permission denied.
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
  action: { marginTop: spacing.md, alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radii.full, backgroundColor: colors.accent },
  actionText: { color: colors.onAccent, fontSize: 15, fontWeight: "700" },
  privacyCard: { padding: spacing.lg, borderRadius: radii.xl, marginTop: spacing.sm },
  privacyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 6 },
});
