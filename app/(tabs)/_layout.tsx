import { Tabs } from "expo-router";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, isDark, shadow } from "../../lib/theme";
import { TAB_BAR_GAP, TAB_BAR_HEIGHT } from "../../lib/ui/tab-bar";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Filled when selected, outlined otherwise (Apple's tab bar convention).
function tabIcon(filled: IconName, outline: IconName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? filled : outline} size={24} color={color as string} />;
  };
}

// Frosted on iOS; on Android a translucent fill with a light edge, because a
// real blur there needs a blur target the navigator does not expose.
// shortcut: no live blur on Android, upgrade when expo-blur can target the tab scenes.
function GlassBar() {
  return (
    <View style={bar.clip} pointerEvents="none">
      {Platform.OS === "ios" && <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, bar.fill]} />
    </View>
  );
}

const bar = StyleSheet.create({
  clip: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  fill: { backgroundColor: Platform.OS === "ios" ? colors.glass : colors.glassStrong },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      // The floating bar adds its own gap above the system navigation area.
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "600", fontSize: 17 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Keeps the chat box visible while typing.
        tabBarHideOnKeyboard: true,
        // Liquid glass: the bar floats over the screens, so content shows
        // through it. Tab screens leave room for it (lib/ui/tab-bar.ts).
        tabBarStyle: {
          position: "absolute",
          left: 20,
          right: 20,
          bottom: insets.bottom + TAB_BAR_GAP,
          height: TAB_BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: "transparent",
          // Android draws elevation shadows as a solid plate under a see-through view.
          ...shadow.lg,
          elevation: 0,
        },
        tabBarBackground: () => <GlassBar />,
        tabBarItemStyle: { minHeight: 48 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          headerShown: false,
          tabBarLabel: "Today",
          tabBarIcon: tabIcon("sunny", "sunny-outline"),
        }}
      />
      <Tabs.Screen
        name="talk"
        options={{
          title: "Talk",
          tabBarLabel: "Talk",
          tabBarIcon: tabIcon("chatbubble-ellipses", "chatbubble-ellipses-outline"),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Plan",
          tabBarLabel: "Plan",
          tabBarIcon: tabIcon("calendar", "calendar-outline"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: tabIcon("settings", "settings-outline"),
        }}
      />
    </Tabs>
  );
}
