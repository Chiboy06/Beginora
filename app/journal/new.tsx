// A journal entry: a mood, a few words, and what helped. Everything optional
// except picking a mood or writing something.

import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { Button, Card, Chip, MoodPicker, SectionTitle, kit } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { deleteJournalEntry, getJournalEntries, saveJournalEntry } from "../../lib/storage/database";
import { HELPED_TAGS } from "../../lib/planner/moods";
import { colors, spacing } from "../../lib/theme";

export default function JournalEntryScreen() {
  const params = useLocalSearchParams<{ id?: string; mood?: string }>();
  const router = useRouter();
  const [mood, setMood] = useState<string | null>(params.mood ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [createdAt, setCreatedAt] = useState(() => Date.now());
  const editing = !!params.id;

  useEffect(() => {
    if (!params.id) return;
    getJournalEntries().then((all) => {
      const e = all.find((x) => x.id === params.id);
      if (!e) return;
      setMood(e.mood);
      setTitle(e.title ?? "");
      setBody(e.body ?? "");
      setTags(e.tags);
      setCreatedAt(e.createdAt);
    }).catch(() => {});
  }, [params.id]);

  const toggle = (t: string) => setTags((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]));
  const canSave = !!mood || !!body.trim() || !!title.trim();

  const save = async () => {
    try {
      await saveJournalEntry({
        id: params.id ?? uuid(),
        mood,
        title: title.trim() || null,
        body: body.trim() || null,
        tags,
        createdAt,
      });
      router.back();
    } catch {
      Alert.alert("Not saved", "Please try again in a moment.");
    }
  };

  const remove = () =>
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteJournalEntry(params.id!).catch(() => {}); router.back(); } },
    ]);

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.h1} accessibilityRole="header">How was your day?</Text>
        <Text style={kit.sub}>Pick what fits. There are no wrong answers.</Text>
        <MoodPicker value={mood} onChange={setMood} />

        <SectionTitle>A few words (optional)</SectionTitle>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title, e.g. A slow start"
          placeholderTextColor={colors.textPlaceholder}
          style={kit.input}
          maxLength={80}
          accessibilityLabel="Title"
        />
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="How did it go? A few words are enough."
          placeholderTextColor={colors.textPlaceholder}
          style={[kit.input, { minHeight: 120, textAlignVertical: "top" }]}
          multiline
          maxLength={4000}
          accessibilityLabel="How did it go"
        />

        <SectionTitle>What helped or what you liked</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <View style={kit.chips}>
            {[...HELPED_TAGS, ...tags.filter((t) => !HELPED_TAGS.includes(t))].map((t) => (
              <Chip key={t} label={t} selected={tags.includes(t)} onPress={() => toggle(t)} />
            ))}
          </View>
          <TextInput
            value={custom}
            onChangeText={setCustom}
            placeholder="Add your own"
            placeholderTextColor={colors.textPlaceholder}
            style={kit.input}
            maxLength={30}
            onSubmitEditing={() => { if (custom.trim()) { toggle(custom.trim()); setCustom(""); } }}
            returnKeyType="done"
            accessibilityLabel="Add your own thing that helped"
          />
        </Card>

        <Button label="Save" onPress={save} disabled={!canSave} style={{ marginTop: spacing.md }} />
        {editing && <Button label="Delete entry" kind="danger" icon="trash-outline" onPress={remove} />}
      </ScrollView>
    </GlassScreen>
  );
}
