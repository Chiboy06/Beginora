import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Filled when selected, outlined otherwise (Apple's tab bar convention).
function tabIcon(filled: IconName, outline: IconName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? filled : outline} size={24} color={color as string} />;
  };
}

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
        // In the layout flow, not absolute, so it never covers screen content.
        tabBarStyle: {
          marginHorizontal: 20,
          marginBottom: insets.bottom + 10,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          ...shadow.lg,
        },
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
          tabBarLabel: "Today",
          tabBarIcon: tabIcon("sunny", "sunny-outline"),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarLabel: "Tasks",
          tabBarIcon: tabIcon("checkmark-circle", "checkmark-circle-outline"),
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
