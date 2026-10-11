import { ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassScreen, GlassSurface } from "../components/GlassSurface";
import { MCP_DISABLED_MESSAGE } from "../lib/mcp/mcp-lifecycle";
import { colors, radii, spacing, typography } from "../lib/theme";

export default function McpScreen() {
  return (
    <GlassScreen>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>MCP connection</Text>
        <GlassSurface style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Temporarily unavailable</Text>
          </View>
          <Text style={styles.body}>{MCP_DISABLED_MESSAGE}</Text>
          <Text style={styles.detail}>
            Earlier paired credentials have been revoked. Beginora will not expose contacts, calendar events, or imported document excerpts over the current network transport. Core offline tasks and chat remain available.
          </Text>
        </GlassSurface>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  heading: { ...typography.heading, color: colors.textPrimary, marginTop: spacing.sm },
  card: { padding: spacing.lg, borderRadius: radii.xl, gap: spacing.md },
  badge: { alignSelf: "flex-start", backgroundColor: colors.accentMuted, borderRadius: radii.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  badgeText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  body: { color: colors.textPrimary, fontSize: 15, lineHeight: 23, fontWeight: "600" },
  detail: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
});
