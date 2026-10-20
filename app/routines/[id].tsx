// Run a routine one step per page: the timer first, then "Done" or a smaller
// way in. At the end, an optional mood with three faces.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { Button, Card, MoodPicker, StepTimer, kit } from "../../components/Kit";
import { GlassScreen } from "../../components/GlassSurface";
import { getRoutines, saveJournalEntry, type Routine } from "../../lib/storage/database";
import { QUICK_MOODS } from "../../lib/planner/moods";
import { colors, spacing, typography } from "../../lib/theme";

export default function RunRoutineScreen() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [routine, setRoutine] = useState<Routine | null | undefined>(undefined);
  const [index, setIndex] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [smaller, setSmaller] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  useEffect(() => {
    getRoutines().then((all) => setRoutine(all.find((r) => r.id === id) ?? null)).catch(() => setRoutine(null));
  }, [id]);

  useLayoutEffect(() => {
    if (routine) navigation.setOptions({ title: routine.name });
  }, [navigation, routine]);

  const onFinish = useCallback(() => setTimeUp(true), []);

  if (routine === undefined) return <GlassScreen><View /></GlassScreen>;
  if (routine === null || routine.steps.length === 0) {
    return (
      <GlassScreen>
        <View style={kit.screenPad}>
          <Text style={kit.body}>This routine isn't available.</Text>
          <Button label="Go back" kind="quiet" onPress={() => router.back()} />
        </View>
      </GlassScreen>
    );
  }

  const finished = index >= routine.steps.length;
  const next = (completed: boolean) => {
    if (completed) setDoneCount((n) => n + 1);
    setIndex((i) => i + 1);
    setSmaller(false);
    setTimeUp(false);
  };

  if (finished) {
    const finish = async () => {
      if (mood) {
        await saveJournalEntry({ id: uuid(), mood, title: routine.name, body: `${doneCount} of ${routine.steps.length} steps done.`, tags: ["Routine"], createdAt: Date.now() }).catch(() => {});
      }
      router.back();
    };
    return (
      <GlassScreen>
        <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.lg }]}>
          <Text style={kit.h1} accessibilityRole="header">Routine finished</Text>
          <Text style={kit.sub}>{doneCount} of {routine.steps.length} steps done. Every step counts, and so does stopping.</Text>
          <Card style={{ gap: spacing.md }}>
            <Text style={styles.label}>How do you feel? (optional)</Text>
            <MoodPicker value={mood} onChange={setMood} keys={QUICK_MOODS} />
          </Card>
          <Button label="Done" onPress={finish} />
        </ScrollView>
      </GlassScreen>
    );
  }

  const step = routine.steps[index];
  const minutes = smaller ? 1 : step.minutes;
  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.lg }]}>
        <Text style={styles.progress} accessibilityLiveRegion="polite">Step {index + 1} of {routine.steps.length}</Text>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${(index / routine.steps.length) * 100}%` }]} /></View>
        <Text style={kit.h1} accessibilityRole="header">{step.title}</Text>
        <Text style={kit.sub}>{smaller ? "Just one minute. That counts." : `${step.minutes} min`}</Text>
        <StepTimer minutes={minutes} onFinish={onFinish} />
        {timeUp && <Text style={kit.body}>Time's up. Finish when you're ready, or move on.</Text>}
        <Button label="Done, next step" icon="checkmark" onPress={() => next(true)} />
        {!smaller && <Button label="Make it smaller" kind="secondary" onPress={() => setSmaller(true)} />}
        <Button label="Skip this step" kind="quiet" onPress={() => next(false)} />
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  progress: { ...typography.footnote, color: colors.accent, fontWeight: "700" },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: colors.accent },
  label: { ...typography.headline, color: colors.textPrimary },
});
