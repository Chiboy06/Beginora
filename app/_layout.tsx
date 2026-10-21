import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useRef } from "react";
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
  Linking,
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
import { STARTUP_READY_TIMEOUT_MS, startStartupTask, waitForStartupTasks } from "../lib/startup/startup-readiness";
import { createNativeSplashHideController } from "../lib/startup/native-splash";
import { startTelegramBot, stopTelegramBot } from "../lib/telegram/telegram-runner";
import { setCheckInsScheduled } from "../lib/focus/background-check-ins";
import { smsUrl } from "../lib/native/communication";
import { colors, isDark, spacing, typography } from "../lib/theme";

// Keep Expo's default first-frame splash dismissal. A module-level manual hold
// can strand the user on the native splash if this tree fails before mounting.

export default function RootLayout() {
  const router = useRouter();
  const init = useChatStore((s) => s.init);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const onboardingDone = useOnboardingStore((s) => s.done);
  const modelLoaded = useChatStore((s) => s.modelLoaded);
  const [ready, setReady] = useState(false);
  const splashHide = useRef<ReturnType<typeof createNativeSplashHideController> | null>(null);
  if (splashHide.current === null) {
    splashHide.current = createNativeSplashHideController(
      () => SplashScreen.hideAsync(),
      (attempt, maxAttempts) => {
        console.warn(`[startup] native splash hide failed (attempt ${attempt}/${maxAttempts})`);
      },
    );
  }

  // Effects run after the first React commit, regardless of whether startup
  // readiness has already advanced beyond the transient loading view.
  useEffect(() => {
    void splashHide.current?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    const startupWork = Promise.all([
      startStartupTask(init, (err) => console.error("Chat init failed:", err)),
      startStartupTask(loadTasks, (err) => console.error("Task load failed:", err)),
    ]);
    void waitForStartupTasks(startupWork, STARTUP_READY_TIMEOUT_MS).then((result) => {
      if (!mounted) return;
      if (result === "timed_out") {
        console.warn("[startup] showing the app while local initialization continues");
      } else {
        console.info("[startup] local initialization finished");
      }
      setReady(true);
    });
    // MCP is deliberately unavailable; shutting down any legacy server is
    // useful cleanup, but must not gate the task/chat UI.
    void startStartupTask(disableMcpServer, (err) => console.warn("Legacy MCP shutdown failed:", err));
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

  // Opt-in agent features. Neither may block or crash the app shell.
  useEffect(() => {
    if (!ready || !onboardingDone) return;
    void startTelegramBot().catch((err) => console.warn("Telegram bot not started:", err));
    if (prefs.checkInsEnabled) {
      void setCheckInsScheduled(true).catch((err) => console.warn("Check-ins not scheduled:", err));
    }
    return () => stopTelegramBot();
  }, [ready, onboardingDone]);

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
      } else if (data.kind === "weekly_plan") {
        router.push("/weekly-plan");
      } else if (data.kind === "appointment") {
        router.push("/calendar");
      } else if (data.kind === "sms" && typeof data.to === "string") {
        // Scheduled text: open the ready-written message; the user taps send.
        void Linking.openURL(smsUrl(data.to, typeof data.body === "string" ? data.body : "")).catch(() => {});
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
        style={styles.splash}
      >
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={styles.splashInner}>
          <Text style={styles.splashWordmark}>Beginora</Text>
          <Text style={styles.splashTagline}>Getting your tasks ready…</Text>
          <ActivityIndicator size="large" color={colors.accent} style={styles.splashSpinner} />
        </View>
      </View>
    );
  }

  // The root layout must ALWAYS mount a navigator. Returning a bare <Redirect>
  // here (no Stack/Slot) means Expo Router can never complete the redirect, so
  // on a fresh install it remounts RootLayout forever and the startup spinner
  // blinks. Gate screens with Stack.Protected instead.
  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "600", fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {/* First run: onboarding is the only reachable screen until it is completed. */}
        <Stack.Protected guard={!onboardingDone}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>

        {/* Everything else is available once onboarding is done. */}
        <Stack.Protected guard={onboardingDone}>
          {/* Tab navigator — primary navigation */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat" options={{ headerShown: false }} />

          {/* Task screens */}
          <Stack.Screen name="task/new" options={{ title: "New Task", presentation: "modal" }} />
          <Stack.Screen name="task/[id]" options={{ title: "Task" }} />
          <Stack.Screen name="task/focus" options={{ title: "Focus", presentation: "modal" }} />
          <Stack.Screen name="calendar" options={{ title: "Calendar preparation", presentation: "modal" }} />
          <Stack.Screen name="appointment/new" options={{ title: "Add appointment", presentation: "modal" }} />
          <Stack.Screen name="email" options={{ title: "Email draft", presentation: "modal" }} />
          <Stack.Screen name="capture" options={{ title: "Capture", presentation: "modal" }} />
          <Stack.Screen name="task/edit" options={{ title: "Edit task", presentation: "modal" }} />
          <Stack.Screen name="reset" options={{ title: "Reset my day" }} />
          <Stack.Screen name="goals" options={{ title: "My goals" }} />
          <Stack.Screen name="weekly-plan" options={{ title: "Plan my week" }} />

          {/* Routines, mood and journal */}
          <Stack.Screen name="routines/index" options={{ title: "Routines" }} />
          <Stack.Screen name="routines/[id]" options={{ title: "Routine" }} />
          <Stack.Screen name="journal/index" options={{ title: "Mood & journal" }} />
          <Stack.Screen name="journal/new" options={{ title: "Journal entry", presentation: "modal" }} />

          {/* Utility screens */}
          <Stack.Screen name="connectors" options={{ title: "Permissions" }} />
          <Stack.Screen name="history" options={{ title: "Conversations" }} />
          <Stack.Screen name="models" options={{ title: "Models" }} />
          <Stack.Screen name="documents" options={{ title: "Documents" }} />
          <Stack.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
          <Stack.Screen name="memory" options={{ title: "Memory" }} />
          <Stack.Screen name="online-ai" options={{ title: "Online model" }} />
          <Stack.Screen name="telegram" options={{ title: "Telegram" }} />
          <Stack.Screen name="mcp" options={{ title: "MCP Server" }} />
        </Stack.Protected>
      </Stack>
      {/* In-app active-task overlay; background model service is opt-in from Settings. */}
      {onboardingDone ? <FloatingBubble /> : null}
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
