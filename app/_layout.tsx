import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect } from "react";
import {
  View,
  ActivityIndicator,
  AppState,
  NativeEventEmitter,
  NativeModules,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useChatStore } from "../lib/store/chat-store";
import { useTaskStore } from "../lib/store/task-store";
import { unloadEmbeddingModel, isEmbeddingLoaded } from "../lib/llm/embed-engine";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const init = useChatStore((s) => s.init);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      init().catch((err) => console.error("Chat init failed:", err)),
      loadTasks().catch((err) => console.error("Task load failed:", err)),
    ]).finally(() => setReady(true));
  }, []);

  // Release embedding model RAM when backgrounded — reloads lazily on next use
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        unloadEmbeddingModel().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Android low-memory: release only the cheap-to-rebuild embedding context
  useEffect(() => {
    const mod = NativeModules.SystemActionsModule;
    if (!mod) return;
    const emitter = new NativeEventEmitter(mod);
    const sub = emitter.addListener("memoryWarning", (level: number) => {
      if (isEmbeddingLoaded()) {
        console.log(`[MemoryPressure] releasing embed context (trim level ${level})`);
      }
      unloadEmbeddingModel().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "600", fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* Tab navigator — primary navigation */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Task screens */}
        <Stack.Screen name="task/new" options={{ title: "New Task", presentation: "modal" }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task" }} />

        {/* Utility screens */}
        <Stack.Screen name="history" options={{ title: "Conversations" }} />
        <Stack.Screen name="models" options={{ title: "Models" }} />
        <Stack.Screen name="documents" options={{ title: "Documents" }} />
        <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
        <Stack.Screen name="mcp" options={{ title: "MCP Server" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
