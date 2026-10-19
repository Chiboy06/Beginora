import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
  TextInput,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useChatStore } from "../../lib/store/chat-store";
import {
  importKnowledgeFile,
  removeKnowledgeFile,
  listKnowledgeFiles,
  KnowledgeTooLargeError,
} from "../../lib/orchestrator/knowledge-manager";
import { getConfig, setConfig } from "../../lib/storage/database";
import type { KnowledgeFile } from "../../lib/storage/database";
import { useModelStore } from "../../lib/store/model-store";
import { prefs } from "../../lib/store/prefs";
import { startBeginoraService, stopBeginoraService } from "../../lib/native/vesta-service";
import {
  getPerfSettings,
  setPerfSettings,
  DEFAULT_PERF,
  type PerfSettings,
} from "../../lib/llm/perf-config";
import {
  getTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
  type TelegramConfig,
} from "../../lib/telegram/telegram-service";
import { colors, spacing, radii, typography } from "../../lib/theme";
import type { Language } from "../../lib/orchestrator/types";
import { GlassScreen } from "../../components/GlassSurface";
import { applyDownloadedAppUpdate, checkForAppUpdate } from "../../lib/updates/update-service";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const language = useChatStore((s) => s.language);
  const modelLoaded = useChatStore((s) => s.modelLoaded);
  const modelPath = useChatStore((s) => s.modelPath);
  const setLanguage = useChatStore((s) => s.setLanguage);

  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [confirmActions, setConfirmActions] = useState(true);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [telegram, setTelegram] = useState<TelegramConfig>({ botToken: "", chatId: "", enabled: false });
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramSaved, setTelegramSaved] = useState(false);
  const [keepModelInBackground, setKeepModelInBackground] = useState(prefs.keepModelInBackground);
  const [backgroundServiceBusy, setBackgroundServiceBusy] = useState(false);

  useEffect(() => {
    getTelegramConfig().then((config) => {
      setTelegram(config);
      setTelegramSaved(true);
    }).catch(() => {});
  }, []);

  const updateTelegram = (patch: Partial<TelegramConfig>) => {
    setTelegram((current) => ({ ...current, ...patch }));
    setTelegramSaved(false);
  };

  const persistTelegram = async () => {
    setTelegramBusy(true);
    try {
      await saveTelegramConfig(telegram);
      setTelegramSaved(true);
      Alert.alert("Saved", "The bot token is stored in Android secure storage. Telegram sends remain user-triggered.");
    } catch {
      Alert.alert("Not saved", "Beginora couldn’t securely save these settings. Check device secure storage and try again.");
    } finally {
      setTelegramBusy(false);
    }
  };

  const removeTelegram = () => {
    Alert.alert("Remove Telegram credentials?", "This deletes the saved bot token and disables the integration on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setTelegramBusy(true);
          try {
            const empty = { botToken: "", chatId: "", enabled: false };
            await saveTelegramConfig(empty);
            setTelegram(empty);
            setTelegramSaved(true);
          } catch {
            Alert.alert("Not removed", "The credentials could not be removed from secure storage.");
          } finally {
            setTelegramBusy(false);
          }
        },
      },
    ]);
  };

  const testTelegram = async () => {
    if (!telegramSaved) {
      Alert.alert("Save settings first", "Save the current bot token and chat ID before sending a test message.");
      return;
    }
    setTelegramBusy(true);
    try {
      const result = await sendTelegramMessage("Beginora is connected. This is a user-requested test message.");
      Alert.alert(result.ok ? "Sent" : "Not sent", result.ok ? "The test message was sent to Telegram." : (result.error ?? "Check your bot token and chat ID."));
    } catch {
      Alert.alert("Not sent", "Telegram settings could not be read. Check secure storage and try again.");
    } finally {
      setTelegramBusy(false);
    }
  };

  useEffect(() => {
    getConfig("confirm_destructive_actions")
      .then((v) => setConfirmActions(v !== "false"))
      .catch(() => {});
  }, []);

  const toggleConfirmActions = (value: boolean) => {
    setConfirmActions(value);
    setConfig("confirm_destructive_actions", value ? "true" : "false").catch(() => {});
  };

  const reloadActive = useModelStore((s) => s.reloadActive);
  const [perf, setPerf] = useState<PerfSettings>(DEFAULT_PERF);
  const [perfBusy, setPerfBusy] = useState(false);

  useEffect(() => {
    getPerfSettings().then(setPerf).catch(() => {});
  }, []);

  const updatePerf = async (next: PerfSettings) => {
    const prev = perf;
    setPerf(next);
    setPerfBusy(true);
    try {
      await setPerfSettings(next);
      await reloadActive();
    } catch (e) {
      setPerf(prev);
      await setPerfSettings(prev).catch(() => {});
      await reloadActive().catch(() => {});
      Alert.alert("Performance", e instanceof Error ? e.message : String(e));
    } finally {
      setPerfBusy(false);
    }
  };

  const toggleBackgroundModel = async (enabled: boolean) => {
    if (backgroundServiceBusy) return;
    setBackgroundServiceBusy(true);
    try {
      if (enabled) {
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain !== false) {
          permission = await Notifications.requestPermissionsAsync();
        }
        if (!permission.granted) {
          Alert.alert("Notifications required", "Android needs notification permission to show the persistent background-model service. The setting remains off.");
          return;
        }
        prefs.keepModelInBackground = true;
        setKeepModelInBackground(true);
        if (modelLoaded) await startBeginoraService();
        else Alert.alert("Background mode ready", "Beginora will start the background service after an on-device model is loaded.");
      } else {
        prefs.keepModelInBackground = false;
        setKeepModelInBackground(false);
        await stopBeginoraService();
      }
    } catch {
      prefs.keepModelInBackground = false;
      setKeepModelInBackground(false);
      Alert.alert("Background mode not changed", "Beginora could not update the background service. Check Android notification permission and try again.");
    } finally {
      setBackgroundServiceBusy(false);
    }
  };

  const refreshKnowledgeFiles = useCallback(async () => {
    try {
      const files = await listKnowledgeFiles();
      setKnowledgeFiles(files);
    } catch (err) {
      console.warn("Failed to load knowledge files:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refreshKnowledgeFiles(), 0);
    return () => clearTimeout(timer);
  }, [refreshKnowledgeFiles]);

  const handleAddKnowledgeFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "text/*",
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const name = asset.name ?? "unknown.md";
      if (!name.endsWith(".md") && !name.endsWith(".txt")) {
        Alert.alert("Invalid file", "Please select a .md or .txt file.");
        return;
      }
      await importKnowledgeFile(asset.uri, name);
      await refreshKnowledgeFiles();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof KnowledgeTooLargeError) {
        Alert.alert("File too large", msg);
      } else {
        Alert.alert("Error", `Failed to import file: ${msg}`);
      }
    }
  };

  const handleRemoveKnowledgeFile = (file: KnowledgeFile) => {
    Alert.alert(
      "Remove file",
      `Remove "${file.filename}" from Beginora's context?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeKnowledgeFile(file.id);
            await refreshKnowledgeFiles();
          },
        },
      ],
    );
  };

  const toggleLanguage = () => {
    const next: Language = language === "it" ? "en" : "it";
    setLanguage(next);
  };

  const handleCheckForUpdates = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateMessage(null);
    const result = await checkForAppUpdate();
    setUpdateMessage(result.message);
    setUpdateBusy(false);
    if (result.status === "update_ready") {
      Alert.alert("Update downloaded", "Restart Beginora now to apply the compatible code update? Your local tasks and plans remain on this device.", [
        { text: "Later", style: "cancel" },
        { text: "Restart now", onPress: () => { void applyDownloadedAppUpdate().catch(() => Alert.alert("Update", "Could not restart into the downloaded update.")); } },
      ]);
    }
  };

  const shortPath = modelPath ? modelPath.split("/").pop() || modelPath : "None";

  return (
    <GlassScreen>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* AI Model */}
      <Text style={styles.sectionTitle}>AI Model</Text>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.label}>Status</Text>
          <View style={[styles.statusBadge, modelLoaded ? styles.statusLoaded : styles.statusNotLoaded]}>
            <View style={[styles.statusDot, modelLoaded ? styles.dotLoaded : styles.dotNotLoaded]} />
            <Text style={[styles.statusText, modelLoaded ? styles.statusLoadedText : styles.statusNotLoadedText]}>
              {modelLoaded ? "Ready" : "Not loaded"}
            </Text>
          </View>
        </View>
        {modelLoaded && (
          <View style={styles.fileRow}>
            <Text style={styles.label}>File</Text>
            <Text style={styles.fileValue} numberOfLines={1}>{shortPath}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => router.push("/models")}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>
            {modelLoaded ? "Manage Models" : "Download a Model"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Language */}
      <Text style={styles.sectionTitle}>Language</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.langBtn} onPress={toggleLanguage} activeOpacity={0.7}>
          <View>
            <Text style={styles.langText}>{language === "it" ? "Italiano" : "English"}</Text>
            <Text style={styles.langHint}>Tap to switch</Text>
          </View>
          <View style={styles.langArrow}>
            <Text style={styles.langArrowText}>⇄</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Privacy & Safety */}
      <Text style={styles.sectionTitle}>Privacy & Safety</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Confirm actions</Text>
            <Text style={styles.toggleHint}>
              Ask before Beginora sets alarms, creates events, or sends reminders.
            </Text>
          </View>
          <Switch
            value={confirmActions}
            onValueChange={toggleConfirmActions}
            trackColor={{ false: colors.disabled, true: colors.accent }}
            accessibilityLabel="Confirm actions before executing"
          />
        </View>
        <Text style={[styles.toggleHint, { marginTop: spacing.lg }]}>Tasks, plans, and activity remain on this device. Cloud sync is disabled; optional integrations and update checks contact their named providers when you choose to use them.</Text>
      </View>

      <Text style={styles.sectionTitle}>Connections</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>Review appointments, set local reminders, prepare an editable email draft, or send a task summary to Telegram. Optional connections are user-triggered and disclose the data they share.</Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }]}
          onPress={() => router.push("/connectors")}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>Manage Connections</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>App updates</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>Check and download compatible interface and JavaScript updates published from the Beginora repository to its EAS preview channel. An internet connection and a release APK linked to that EAS project are required. You choose whether to restart; native changes still need a new APK, and tasks stay on this device.</Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, updateBusy && styles.btnBusy, { marginTop: spacing.md }]}
          onPress={handleCheckForUpdates}
          disabled={updateBusy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Check for compatible Beginora updates"
        >
          <Text style={styles.btnPrimaryText}>{updateBusy ? "Checking…" : "Check for updates"}</Text>
        </TouchableOpacity>
        {!!updateMessage && <Text style={[styles.desc, { marginTop: spacing.sm }]} accessibilityRole="text">{updateMessage}</Text>}
      </View>

      <Text style={styles.sectionTitle}>About this app</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Beginora is a planning and focus aid, not medical care. It does not diagnose or treat ADHD and does not replace professional support.
        </Text>
      </View>

      {/* Documents */}
      <Text style={styles.sectionTitle}>Documents</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Import PDFs or text files. Beginora searches them on-device to help you work through tasks — fully offline.
        </Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }]}
          onPress={() => router.push("/documents")}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>Manage Documents</Text>
        </TouchableOpacity>
      </View>

      {/* Knowledge Files */}
      <Text style={styles.sectionTitle}>Personal Context</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Add .md or .txt files with notes about yourself — your routines, preferences, or anything that helps Beginora understand your situation.
        </Text>
        {knowledgeFiles.map((file) => (
          <View key={file.id} style={styles.fileItemRow}>
            <View style={styles.fileItemInfo}>
              <Text style={styles.fileItemName} numberOfLines={1}>{file.filename}</Text>
              <Text style={styles.fileItemSize}>{formatFileSize(file.fileSize)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleRemoveKnowledgeFile(file)}
              style={styles.removeBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${file.filename}`}
            >
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }]}
          onPress={handleAddKnowledgeFile}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>Add File</Text>
        </TouchableOpacity>
      </View>

      {/* Performance */}
      <Text style={styles.sectionTitle}>Performance</Text>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>CPU threads</Text>
            <Text style={styles.toggleHint}>More threads can speed up the AI on multi-core phones.</Text>
          </View>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              disabled={perfBusy || perf.threads <= 1}
              onPress={() => updatePerf({ ...perf, threads: Math.max(1, perf.threads - 1) })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Decrease threads"
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{perf.threads}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              disabled={perfBusy || perf.threads >= 8}
              onPress={() => updatePerf({ ...perf, threads: Math.min(8, perf.threads + 1) })}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Increase threads"
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.toggleRow, { marginTop: spacing.lg }]}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Quantize KV cache</Text>
            <Text style={styles.toggleHint}>Halves memory for long conversations. Slightly slower.</Text>
          </View>
          <Switch
            value={perf.kvQuant}
            onValueChange={(v) => updatePerf({ ...perf, kvQuant: v })}
            disabled={perfBusy}
            trackColor={{ false: colors.disabled, true: colors.accent }}
          />
        </View>
        <View style={[styles.toggleRow, { marginTop: spacing.lg }]}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Keep model in RAM</Text>
            <Text style={styles.toggleHint}>Prevents the OS from paging out the model. Faster, uses more RAM.</Text>
          </View>
          <Switch
            value={perf.useMlock}
            onValueChange={(v) => updatePerf({ ...perf, useMlock: v })}
            disabled={perfBusy}
            trackColor={{ false: colors.disabled, true: colors.accent }}
          />
        </View>
        {Platform.OS === "android" && (
          <View style={[styles.toggleRow, { marginTop: spacing.lg }]}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Keep model active in background</Text>
              <Text style={styles.toggleHint}>Optional persistent notification; uses more battery and memory. Off by default.</Text>
            </View>
            <Switch
              value={keepModelInBackground}
              onValueChange={toggleBackgroundModel}
              disabled={backgroundServiceBusy}
              trackColor={{ false: colors.disabled, true: colors.accent }}
              accessibilityLabel="Keep the local model active in the background"
            />
          </View>
        )}
        {perfBusy && <Text style={[styles.toggleHint, { marginTop: spacing.sm }]}>Reloading model…</Text>}
      </View>

      {/* Diagnostics */}
      <Text style={styles.sectionTitle}>Diagnostics</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>On-device status: model, prefill timing, and database size. These diagnostics stay local; optional update checks and services contact their named providers when you use them.</Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }]}
          onPress={() => router.push("/diagnostics")}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.btnPrimaryText}>Open Diagnostics</Text>
        </TouchableOpacity>
      </View>

      {/* Telegram */}
      <Text style={styles.sectionTitle}>Telegram</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Send task summaries to Telegram only when you tap Send. The selected text and chat ID go to Telegram over HTTPS; the bot token is stored in Android secure storage. Telegram reminders are not active in this build.
        </Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleTitle}>Enable Telegram for explicit sends</Text>
          </View>
          <Switch
            value={telegram.enabled}
            onValueChange={(v) => updateTelegram({ enabled: v })}
            trackColor={{ false: colors.disabled, true: colors.accent }}
            accessibilityLabel="Enable Telegram integration"
          />
        </View>
        <>
            <Text style={[styles.toggleTitle, { marginTop: spacing.md, marginBottom: 4 }]}>Bot token</Text>
            <TextInput
              style={styles.textField}
              value={telegram.botToken}
              onChangeText={(v) => updateTelegram({ botToken: v })}
              placeholder="123456:ABC-DEF..."
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              accessibilityLabel="Telegram bot token"
            />
            <Text style={[styles.toggleTitle, { marginTop: spacing.md, marginBottom: 4 }]}>Chat ID</Text>
            <TextInput
              style={styles.textField}
              value={telegram.chatId}
              onChangeText={(v) => updateTelegram({ chatId: v })}
              placeholder="Your numeric chat ID"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="numeric"
              accessibilityLabel="Telegram chat ID"
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }, telegramBusy && styles.btnBusy]}
              onPress={persistTelegram}
              disabled={telegramBusy || telegramSaved}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{telegramBusy ? "Saving…" : telegramSaved ? "Settings saved" : "Save Telegram settings"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, { marginTop: spacing.md }, telegramBusy && styles.btnBusy]}
              onPress={testTelegram}
              disabled={telegramBusy || !telegram.enabled || !telegramSaved || !telegram.botToken || !telegram.chatId}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{telegramBusy ? "Sending…" : "Send test message"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.removeBtn, { marginTop: spacing.md }]}
              onPress={removeTelegram}
              disabled={telegramBusy}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.removeBtnText}>Remove Telegram credentials</Text>
            </TouchableOpacity>
        </>
      </View>

      {/* About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <Text style={styles.desc}>
          Beginora is an offline-first assistant that helps you find a first step. Core task plans and activity stay on this device in this prototype; selected integrations may send the information you choose to their providers.
        </Text>
        <Text style={styles.version}>v0.2.6 — onboarding route fix</Text>
      </View>

    </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  content: { padding: spacing.lg, paddingBottom: 48 },
  sectionTitle: {
    color: colors.textMuted,
    ...typography.sectionTitle,
    marginBottom: 10,
    marginTop: 24,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.9)",
  },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.full },
  statusLoaded: { backgroundColor: colors.successBg },
  statusNotLoaded: { backgroundColor: colors.accentMuted },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  dotLoaded: { backgroundColor: colors.success },
  dotNotLoaded: { backgroundColor: colors.accent },
  statusText: { fontSize: 13, fontWeight: "600" },
  statusLoadedText: { color: colors.success },
  statusNotLoadedText: { color: colors.accent },
  fileRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  fileValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "500", maxWidth: "60%" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  toggleHint: { color: colors.textMuted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepperBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center" },
  stepperText: { fontSize: 20, color: colors.accent, fontWeight: "600" },
  stepperValue: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, minWidth: 16, textAlign: "center" },
  btn: { borderRadius: radii.sm, paddingHorizontal: 18, paddingVertical: 11, alignSelf: "flex-start" },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: "#fff", ...typography.button },
  btnBusy: { opacity: 0.65 },
  langBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  langText: { color: colors.textPrimary, fontSize: 17, fontWeight: "600" },
  langHint: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  langArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center" },
  langArrowText: { fontSize: 16, color: colors.accent },
  desc: { color: colors.textSecondary, ...typography.bodySmall, lineHeight: 20 },
  fileItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, marginTop: spacing.sm },
  fileItemInfo: { flex: 1, marginRight: 12 },
  fileItemName: { color: colors.textPrimary, fontSize: 14, fontWeight: "500" },
  fileItemSize: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.error },
  removeBtnText: { color: colors.error, fontSize: 13, fontWeight: "500" },
  version: { color: colors.textMuted, ...typography.caption, marginTop: 8 },
  textField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
  },
});
