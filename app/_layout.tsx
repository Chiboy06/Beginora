import { Stack, Redirect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Alert,
  AppState,
  Platform,
  NativeEventEmitter,
  NativeModules,
} from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Network from "expo-network";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useChatStore } from "../lib/store/chat-store";
import { useTaskStore } from "../lib/store/task-store";
import { useOnboardingStore } from "../lib/store/onboarding-store";
import { prefs } from "../lib/store/prefs";
import { unloadEmbeddingModel, isEmbeddingLoaded } from "../lib/llm/embed-engine";
import { startBeginoraService, stopBeginoraService } from "../lib/native/vesta-service";
import { disableMcpServer } from "../lib/mcp/mcp-lifecycle";
import { FloatingBubble } from "../components/FloatingBubble";
import { applyDownloadedAppUpdate, checkForAppUpdate } from "../lib/updates/update-service";
import { STARTUP_READY_TIMEOUT_MS, waitForStartupTasks } from "../lib/startup/startup-readiness";
import { colors, spacing, typography } from "../lib/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const init = useChatStore((s) => s.init);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const onboardingDone = useOnboardingStore((s) => s.done);
  const modelLoaded = useChatStore((s) => s.modelLoaded);
  const [ready, setReady] = useState(false);
  const splashHidden = useRef(false);
  const hideNativeSplash = useCallback(() => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const startupWork = Promise.all([
      init().catch((err) => console.error("Chat init failed:", err)),
      loadTasks().catch((err) => console.error("Task load failed:", err)),
      disableMcpServer().catch((err) => console.warn("Legacy MCP shutdown failed:", err)),
    ]);
    void waitForStartupTasks(startupWork, STARTUP_READY_TIMEOUT_MS).then((result) => {
      if (!mounted) return;
      if (result === "timed_out") {
        console.warn("[startup] showing the app while local initialization continues");
      }
      setReady(true);
    });
    return () => { mounted = false; };
  }, [init, loadTasks]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    if (modelLoaded && prefs.keepModelInBackground) {
      startBeginoraService().catch((err) => console.warn("Background model service not started:", err));
    } else {
      stopBeginoraService().catch(() => {});
    }
  }, [modelLoaded]);

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

  useEffect(() => {
    if (!ready || !onboardingDone) return;
    let lastHandledId: string | null = null;
    const openFromNotification = (response: Notifications.NotificationResponse) => {
      const request = response.notification.request;
      if (request.identifier === lastHandledId) return;
      lastHandledId = request.identifier;
      const data = request.content.data ?? {};
      if (data.kind === "task" && typeof data.taskId === "string") {
        router.push({ pathname: "/task/[id]", params: { id: data.taskId } });
      } else if (data.kind === "appointment") {
        router.push("/calendar");
      }
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(openFromNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromNotification(response);
    }).catch(() => {});
    return () => subscription.remove();
  }, [ready, onboardingDone, router]);

  // When internet connectivity appears, silently check/download compatible
  // EAS updates. Applying one always requires an explicit restart choice.
  useEffect(() => {
    if (!ready || !onboardingDone || __DEV__) return;
    let alive = true;
    let checking = false;
    let promptShown = false;
    let lastAttempt = 0;

    const checkWhenOnline = async (networkState?: Network.NetworkState) => {
      if (!alive || checking || promptShown || Date.now() - lastAttempt < 60_000) return;
      try {
        const state = networkState ?? await Network.getNetworkStateAsync();
        if (state.isConnected !== true || state.isInternetReachable === false) return;
        checking = true;
        lastAttempt = Date.now();
        const result = await checkForAppUpdate();
        if (!alive || result.status !== "update_ready") return;
        promptShown = true;
        Alert.alert(
          "Beginora update ready",
          `${result.message} Your local tasks and plans stay on this device.`,
          [
            { text: "Later", style: "cancel" },
            {
              text: "Restart now",
              onPress: () => { void applyDownloadedAppUpdate().catch(() => Alert.alert("Update", "Could not restart into the downloaded update.")); },
            },
          ],
        );
      } catch {
        // A connectivity transition or update check must never block the app.
      } finally {
        checking = false;
      }
    };

    const networkSub = Network.addNetworkStateListener((state) => { void checkWhenOnline(state); });
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkWhenOnline();
    });
    void checkWhenOnline();
    return () => {
      alive = false;
      networkSub.remove();
      appStateSub.remove();
    };
  }, [ready, onboardingDone]);

  if (!ready) {
    return (
      <View
        onLayout={hideNativeSplash}
        style={styles.splash}
      >
        <StatusBar style="dark" />
        <View style={styles.splashInner}>
          <Text style={styles.splashWordmark}>Beginora</Text>
          <Text style={styles.splashTagline}>Getting your tasks ready…</Text>
          <ActivityIndicator size="large" color={colors.accent} style={styles.splashSpinner} />
        </View>
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
        {/* Tab navigator — primary navigation */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Onboarding */}
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />

        {/* Task screens */}
        <Stack.Screen name="task/new" options={{ title: "New Task", presentation: "modal" }} />
        <Stack.Screen name="task/[id]" options={{ title: "Task" }} />
        <Stack.Screen name="task/focus" options={{ title: "Focus", presentation: "modal" }} />
        <Stack.Screen name="calendar" options={{ title: "Calendar preparation", presentation: "modal" }} />
        <Stack.Screen name="appointment/new" options={{ title: "Add appointment", presentation: "modal" }} />
        <Stack.Screen name="email" options={{ title: "Email draft", presentation: "modal" }} />

        {/* Utility screens */}
        <Stack.Screen name="connectors" options={{ title: "Connections" }} />
        <Stack.Screen name="history" options={{ title: "Conversations" }} />
        <Stack.Screen name="models" options={{ title: "Models" }} />
        <Stack.Screen name="documents" options={{ title: "Documents" }} />
        <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
        <Stack.Screen name="mcp" options={{ title: "MCP Server" }} />
      </Stack>
      {/* In-app active-task overlay; background model service is opt-in from Settings. */}
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
  splashInner: { alignItems: "center" },
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
  splashSpinner: { marginTop: 8 },
});
