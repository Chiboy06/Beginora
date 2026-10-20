// Settings > Online model: an optional OpenAI-compatible API with the user's
// own key. Alarms, reminders and tasks always stay on the phone.

import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { prefs } from "../lib/store/prefs";
import { chatCompletionsUrl, getOnlineKey, setOnlineKey, testOnline } from "../lib/llm/remote-engine";
import { colors, spacing } from "../lib/theme";

// Starting points only; the user can type any OpenAI-compatible address.
const PROVIDERS = [
  { label: "OpenRouter", url: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.1-8b-instruct" },
  { label: "Groq", url: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
  { label: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { label: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  { label: "On my network", url: "http://192.168.1.10:1234/v1", model: "local-model" },
];

const MODES: { key: "off" | "fallback" | "always"; label: string; about: string }[] = [
  { key: "off", label: "Off", about: "Everything stays on the phone." },
  { key: "fallback", label: "When needed", about: "Questions go online only when no phone model is loaded or the loaded one is small (under 1.5B)." },
  { key: "always", label: "Always for questions", about: "Every question goes online. Actions still run on the phone." },
];

export default function OnlineAiScreen() {
  const [mode, setMode] = useState(prefs.onlineMode);
  const [baseUrl, setBaseUrl] = useState(prefs.onlineBaseUrl);
  const [model, setModel] = useState(prefs.onlineModel);
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [sendMemories, setSendMemories] = useState(prefs.onlineSendMemories);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getOnlineKey().then((k) => setHasKey(!!k)).catch(() => {});
  }, []);

  const urlOk = !baseUrl.trim() || chatCompletionsUrl(baseUrl) !== null;

  const save = async () => {
    prefs.onlineBaseUrl = baseUrl;
    prefs.onlineModel = model;
    prefs.onlineMode = mode;
    prefs.onlineSendMemories = sendMemories;
    if (key.trim()) {
      await setOnlineKey(key);
      setHasKey(true);
      setKey("");
    }
    setStatus({ ok: true, message: "Saved." });
  };

  const test = async () => {
    setTesting(true);
    setStatus(null);
    const k = key.trim() || (await getOnlineKey());
    setStatus(await testOnline({ url: chatCompletionsUrl(baseUrl), model: model.trim(), key: k }));
    setTesting(false);
  };

  const removeKey = async () => {
    await setOnlineKey("");
    setHasKey(false);
    prefs.onlineMode = "off";
    setMode("off");
    setStatus({ ok: true, message: "Key removed and online model turned off." });
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.sub}>
          Optional. Use your own API key for better answers to questions. Your questions are sent to the provider you choose, and the provider bills you. Alarms, reminders, texts and tasks never go online.
        </Text>

        <SectionTitle>When to use it</SectionTitle>
        <View style={kit.chips}>
          {MODES.map((m) => <Chip key={m.key} label={m.label} selected={mode === m.key} onPress={() => setMode(m.key)} />)}
        </View>
        <Text style={kit.muted}>{MODES.find((m) => m.key === mode)?.about}</Text>

        <SectionTitle>Provider</SectionTitle>
        <View style={kit.chips}>
          {PROVIDERS.map((p) => (
            <Chip key={p.label} label={p.label} selected={baseUrl === p.url} onPress={() => { setBaseUrl(p.url); setModel(p.model); }} />
          ))}
        </View>
        <Card style={{ gap: spacing.sm }}>
          <Text style={kit.muted}>Address (OpenAI-compatible, https)</Text>
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://api.example.com/v1"
            placeholderTextColor={colors.textPlaceholder}
            style={kit.input}
            accessibilityLabel="API address"
          />
          {!urlOk && <Text style={{ color: colors.error }}>Use https, or http only for a computer on your home network.</Text>}
          <Text style={kit.muted}>Model name</Text>
          <TextInput
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. llama-3.1-8b-instant"
            placeholderTextColor={colors.textPlaceholder}
            style={kit.input}
            accessibilityLabel="Model name"
          />
          <Text style={kit.muted}>API key {hasKey ? "(saved in secure storage)" : ""}</Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder={hasKey ? "Leave empty to keep the saved key" : "Paste your API key"}
            placeholderTextColor={colors.textPlaceholder}
            style={kit.input}
            accessibilityLabel="API key"
          />
          <View style={kit.switchRow}>
            <Text style={kit.switchLabel}>Also send my memories with questions about me</Text>
            <Switch value={sendMemories} onValueChange={setSendMemories} trackColor={{ true: colors.accent, false: colors.border }} accessibilityLabel="Send memories online" />
          </View>
        </Card>

        <Button label="Save" onPress={save} disabled={!urlOk} />
        <Button label="Test connection" kind="secondary" onPress={test} disabled={testing || !urlOk || !baseUrl.trim() || !model.trim()} />
        {testing && <ActivityIndicator color={colors.accent} />}
        {status && <Text style={{ color: status.ok ? colors.success : colors.error }} accessibilityLiveRegion="polite">{status.message}</Text>}
        {hasKey && <Button label="Remove key" kind="danger" onPress={removeKey} />}
      </ScrollView>
    </GlassScreen>
  );
}
