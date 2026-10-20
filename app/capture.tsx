// Quick capture: type it the way you would say it. A time in the words becomes
// a reminder; a day without a time asks for one; nothing at all goes to "sort later".

import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Chip, kit } from "../components/Kit";
import { VoiceButton } from "../components/VoiceButton";
import { GlassScreen } from "../components/GlassSurface";
import { captureFrom } from "../lib/orchestrator/direct-actions";
import { useTaskStore } from "../lib/store/task-store";
import { dayLabel, timeLabel } from "../lib/planner/schedule";
import { colors, spacing } from "../lib/theme";

const DAY_TIMES = [9, 13, 18];

export default function CaptureScreen() {
  const router = useRouter();
  const addTask = useTaskStore((s) => s.addTask);
  const [text, setText] = useState("");
  const [pickedHour, setPickedHour] = useState<number | null>(null);
  const [dropTime, setDropTime] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => captureFrom(text, new Date()), [text]);
  const at = dropTime
    ? null
    : parsed.at ?? (parsed.day && pickedHour !== null
      ? new Date(parsed.day.getFullYear(), parsed.day.getMonth(), parsed.day.getDate(), pickedHour)
      : null);

  const save = async () => {
    if (!parsed.title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addTask(parsed.title, at ? { dueAt: at.getTime(), remind: at.getTime() > Date.now() } : {});
      router.back();
    } catch {
      setError("That didn't save. Please try again.");
      setSaving(false);
    }
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.lg }]} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={kit.h1} accessibilityRole="header">What's on your mind?</Text>
          <Text style={kit.sub}>Type it as you would say it. For example: Pay the electricity bill on Friday at 6pm.</Text>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={(t) => { setText(t); setDropTime(false); setPickedHour(null); }}
            placeholder="e.g. Call the dentist tomorrow at 9"
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, styles.flex]}
            autoFocus
            multiline
            maxLength={300}
            accessibilityLabel="What to remember"
            onSubmitEditing={save}
          />
          <VoiceButton onTranscript={(t) => setText((prev) => (prev ? `${prev} ${t}` : t))} />
        </View>

        {text.trim().length > 0 && (
          <Card style={{ gap: spacing.md }}>
            <Text style={kit.muted}>Saving as</Text>
            <Text style={kit.body}>{parsed.title}</Text>
            {at ? (
              <View style={kit.chips}>
                <Chip label={`${dayLabel(at)} · ${timeLabel(at)}`} selected onPress={() => {}} />
                <Chip label="No time" onPress={() => setDropTime(true)} />
              </View>
            ) : parsed.day && !dropTime ? (
              <>
                <Text style={kit.muted}>{dayLabel(parsed.day)}: what time?</Text>
                <View style={kit.chips}>
                  {DAY_TIMES.map((h) => (
                    <Chip key={h} label={timeLabel(new Date(2000, 0, 1, h))} selected={pickedHour === h} onPress={() => setPickedHour(h)} />
                  ))}
                  <Chip label="No time" onPress={() => setDropTime(true)} />
                </View>
              </>
            ) : (
              <Text style={kit.muted}>No time, so it goes to "Sort later" in Plan. You can add a time any time.</Text>
            )}
            {at && <Text style={kit.muted}>A reminder will ring at this time.</Text>}
          </Card>
        )}

        {error && <Text style={{ color: colors.error }}>{error}</Text>}
        <Button label={at ? "Save reminder" : "Save"} onPress={save} disabled={!parsed.title.trim() || saving} />
        <Button label="Add details instead" kind="quiet" onPress={() => router.replace({ pathname: "/task/new", params: { title: parsed.title } })} />
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inputRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
});
