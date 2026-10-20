// Routines: the user's own, a library of ready-made ones, and a short form to
// make a new one.

import { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { v4 as uuid } from "uuid";
import { Button, Card, SectionTitle, kit } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { deleteRoutine, getRoutines, saveRoutine, type Routine } from "../../lib/storage/database";
import { parseSteps, ROUTINE_LIBRARY, routineMinutes, type RoutineTemplate } from "../../lib/planner/routine-library";
import { colors, radii, spacing, typography } from "../../lib/theme";

export default function RoutinesScreen() {
  const router = useRouter();
  const [mine, setMine] = useState<Routine[]>([]);
  const [name, setName] = useState("");
  const [stepsText, setStepsText] = useState("");

  const load = useCallback(() => {
    getRoutines().then(setMine).catch(() => setMine([]));
  }, []);
  useFocusEffect(load);

  const add = async (t: Pick<RoutineTemplate, "name" | "emoji" | "steps">) => {
    const routine: Routine = { id: uuid(), name: t.name, emoji: t.emoji, steps: t.steps, createdAt: Date.now() };
    await saveRoutine(routine);
    load();
    return routine;
  };

  const create = async () => {
    const steps = parseSteps(stepsText);
    if (!name.trim() || steps.length === 0) return;
    await add({ name: name.trim().slice(0, 60), emoji: "⭐", steps });
    setName("");
    setStepsText("");
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.sm }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.sub}>Short steps with a timer each. Skip any step; there is no streak to lose.</Text>

        <SectionTitle>My routines</SectionTitle>
        {mine.length === 0 && <Text style={kit.muted}>None yet. Add one from the library below.</Text>}
        {mine.map((r) => (
          <View key={r.id} style={styles.row}>
            <TouchableOpacity style={styles.main} onPress={() => router.push(`/routines/${r.id}`)} accessibilityRole="button" accessibilityLabel={`Start ${r.name}`}>
              <Text style={styles.emoji}>{r.emoji ?? "⭐"}</Text>
              <View style={styles.flex}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={kit.muted}>{r.steps.length} steps · about {routineMinutes(r.steps)} min</Text>
              </View>
              <Ionicons name="play-circle" size={30} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert(`Delete "${r.name}"?`, undefined, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => void deleteRoutine(r.id).then(load) },
              ])}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${r.name}`}
              style={styles.iconBtn}
            >
              <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}

        <SectionTitle>Library</SectionTitle>
        {ROUTINE_LIBRARY.map((t) => (
          <Card key={t.id} style={styles.libCard}>
            <Text style={styles.emoji}>{t.emoji}</Text>
            <View style={styles.flex}>
              <Text style={styles.name}>{t.name}</Text>
              <Text style={kit.muted}>{t.about} {t.steps.length} steps · {routineMinutes(t.steps)} min</Text>
              <Text style={styles.steps} numberOfLines={2}>{t.steps.map((s) => s.title).join(" → ")}</Text>
            </View>
            <Button label="Add" kind="secondary" onPress={() => void add(t)} />
          </Card>
        ))}

        <SectionTitle>Make your own</SectionTitle>
        <Card style={{ gap: spacing.sm }}>
          <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. After school" placeholderTextColor={colors.textPlaceholder} style={kit.input} accessibilityLabel="Routine name" maxLength={60} />
          <TextInput
            value={stepsText}
            onChangeText={setStepsText}
            placeholder={"One step per line, minutes at the end:\nSnack 10\nHomework 25\nPack bag 5"}
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
            accessibilityLabel="Routine steps, one per line"
          />
          <Button label="Save routine" onPress={create} disabled={!name.trim() || !stepsText.trim()} />
        </Card>
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, minHeight: 64 },
  iconBtn: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  libCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  emoji: { fontSize: 28 },
  name: { ...typography.headline, color: colors.textPrimary },
  steps: { ...typography.footnote, color: colors.textSecondary, marginTop: 4 },
});
