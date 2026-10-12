import { Stack, Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  AppState,
  StyleSheet,
  NativeEventEmitter,
  NativeModules,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useChatStore } from "../lib/store/chat-store";
import { useTaskStore } from "../lib/store/task-store";
import { useOnboardingStore } from "../lib/store/onboarding-store";
import { unloadEmbeddingModel, isEmbeddingLoaded } from "../lib/llm/embed-engine";
import { FloatingBubble } from "../components/FloatingBubble";
import { colors, spacing, typography } from "../lib/theme";

export default function RootLayout() {
  const init = useChatStore((s) => s.init);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const onboardingDone = useOnboardingStore((s) => s.done);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await Promise.all([
          init().catch((err: unknown) => {
            console.error("Chat init failed:", err);
          }),
          loadTasks().catch((err: unknown) => {
            console.error("Task load failed:", err);
          }),
        ]);
      } catch (err) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : "Startup failed");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [init, loadTasks]);

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
    const sub = emitter.addListener("memoryWarning", (level: unknown) => {
      if (isEmbeddingLoaded()) {
        console.log(`[MemoryPressure] releasing embed context (trim level ${String(level)})`);
      }
      unloadEmbeddingModel().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // Loading splash — shown while DB opens and model loads
  if (!ready) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashInner}>
          <Text style={styles.splashWordmark}>Beginora</Text>
          <Text style={styles.splashTagline}>Getting your tasks ready…</Text>
          <ActivityIndicator
            size="large"
            color={colors.accent}
            style={styles.splashSpinner}
          />
        </View>
        {initError && (
          <Text style={styles.splashError}>{initError}</Text>
        )}
      </View>
    );
  }

  if (!onboardingDone) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Redirect href="/onboarding" />
      </SafeAreaProvider>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="task/new" options={{ title: "New Task", presentation: "modal" }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task" }} />
        <Stack.Screen name="task/focus" options={{ title: "Focus", presentation: "modal" }} />
        <Stack.Screen name="calendar" options={{ title: "Calendar preparation", presentation: "modal" }} />
        <Stack.Screen name="appointment/new" options={{ title: "Add appointment", presentation: "modal" }} />
        <Stack.Screen name="email" options={{ title: "Email draft", presentation: "modal" }} />
        <Stack.Screen name="connectors" options={{ title: "Connections" }} />
        <Stack.Screen name="history" options={{ title: "Conversations" }} />
        <Stack.Screen name="models" options={{ title: "Models" }} />
        <Stack.Screen name="documents" options={{ title: "Documents" }} />
        <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
        <Stack.Screen name="mcp" options={{ title: "MCP Server" }} />
      </Stack>
      <FloatingBubble />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  splashInner: {
    alignItems: "center",
  },
  splashWordmark: {
    fontSize: 38,
    fontWeight: "700",
    color: colors.accent,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  splashTagline: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 40,
  },
  splashSpinner: {
    marginTop: 8,
  },
  splashError: {
    position: "absolute",
    bottom: 40,
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
