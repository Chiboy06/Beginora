// Plan my week: talk through a rough plan, see what doesn't match your goals,
// fix the tables (project, task, due date), then create everything at once.

import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Chip, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { VoiceButton } from "../components/VoiceButton";
import { prefs } from "../lib/store/prefs";
import { useTaskStore } from "../lib/store/task-store";
import { reviewWeek } from "../lib/planner/weekly-ai";
import { carryOverTasks, dueToMs, isoDay, type PlannedTask, type WeeklyReview } from "../lib/planner/weekly";
import { addDays, startOfDay } from "../lib/planner/schedule";
import { colors, spacing, typography } from "../lib/theme";

type Step = "draft" | "review" | "done";
type CarryChoice = "keep" | "done" | "drop";

const SOURCE_TEXT: Record<WeeklyReview["source"], string> = {
  online: "Checked against your goals by your online model.",
  phone: "Checked against your goals by the model on your phone.",
  rules: "No AI model was available, so your plan was split into tasks as written. The goal check needs a phone model or an online model.",
};

const dayChip = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

export default function WeeklyPlanScreen() {
  const router = useRouter();
  const tasks = useTaskStore((s) => s.tasks);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const addTask = useTaskStore((s) => s.addTask);
  const setStatus = useTaskStore((s) => s.setStatus);
  const removeTask = useTaskStore((s) => s.removeTask);
  const [step, setStep] = useState<Step>("draft");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [rows, setRows] = useState<PlannedTask[]>([]);
  const [carryChoice, setCarryChoice] = useState<Record<string, CarryChoice>>({});
  const [projects, setProjects] = useState(prefs.projects);
  const [goalSaved, setGoalSaved] = useState(false);
  const [created, setCreated] = useState(0);

  useFocusEffect(useCallback(() => { void loadTasks(); setProjects(prefs.projects); }, [loadTasks]));

  const carry = useMemo(() => carryOverTasks(tasks, new Date()), [tasks]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDay(addDays(startOfDay(new Date()), i))), []);
  const goals = prefs.goalsText;

  const check = async () => {
    setBusy(true);
    try {
      const r = await reviewWeek({ goals, projects, draft, carry: carry.map((t) => t.title) });
      setReview(r);
      setRows(r.tasks);
      setCarryChoice(Object.fromEntries(carry.map((t) => [t.id, "keep" as CarryChoice])));
      setStep("review");
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<PlannedTask>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeMatching = (item: string) => setRows((all) => all.filter((r) => !r.task.toLowerCase().includes(item.toLowerCase().slice(0, 20)) && !item.toLowerCase().includes(r.task.toLowerCase())));
  const newProjects = [...new Set(rows.map((r) => r.project).filter((p): p is string => !!p && !projects.some((x) => x.toLowerCase() === p.toLowerCase())))];
  const toCreate = rows.filter((r) => r.task.trim());
  const drops = carry.filter((t) => carryChoice[t.id] === "drop");

  const approve = async () => {
    const run = async () => {
      setBusy(true);
      let n = 0;
      try {
        for (const r of toCreate) {
          await addTask(r.task.trim().slice(0, 200), { project: r.project, dueAt: dueToMs(r.due) });
          n += 1;
        }
        for (const t of carry) {
          if (carryChoice[t.id] === "done") await setStatus(t.id, "done");
          if (carryChoice[t.id] === "drop") await removeTask(t.id);
        }
        setCreated(n);
        setStep("done");
      } catch {
        Alert.alert("Not everything was saved", `${n} of ${toCreate.length} tasks were created. Please check Plan and try the rest again.`);
      } finally {
        setBusy(false);
      }
    };
    if (drops.length === 0) return run();
    Alert.alert(`Let go of ${drops.length} old ${drops.length === 1 ? "task" : "tasks"}?`, "They will be deleted. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Create and let go", style: "destructive", onPress: () => void run() },
    ]);
  };

  if (step === "done") {
    return (
      <GlassScreen>
        <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.lg }]}>
          <Text style={kit.h1} accessibilityRole="header">Your week is planned</Text>
          <Text style={kit.sub}>{created} {created === 1 ? "task" : "tasks"} added{carry.length ? `, ${carry.filter((t) => carryChoice[t.id] === "keep").length} carried over` : ""}. Start with one small step.</Text>
          <Button label="See my week in Plan" icon="calendar" onPress={() => router.replace("/tasks")} />
          <Button label="Back to Today" kind="quiet" onPress={() => router.replace("/")} />
        </ScrollView>
      </GlassScreen>
    );
  }

  if (step === "review" && review) {
    return (
      <GlassScreen>
        <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
          <Text style={kit.muted}>{SOURCE_TEXT[review.source]}</Text>

          {review.flags.length > 0 && (
            <Card style={[styles.flagCard, { gap: spacing.md }]}>
              <Text style={styles.cardTitle}>Worth a second look</Text>
              {review.flags.map((f) => (
                <View key={f.item} style={{ gap: 4 }}>
                  <Text style={[kit.body, { fontWeight: "600" }]}>{f.item}</Text>
                  <Text style={kit.muted}>{f.reason}</Text>
                  <View style={kit.chips}>
                    <Chip label="Remove from plan" onPress={() => removeMatching(f.item)} />
                    <Chip label="Keep it" selected onPress={() => {}} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          {(review.goalUpdate || newProjects.length > 0) && !goalSaved && (
            <Card style={{ gap: spacing.sm }}>
              <Text style={styles.cardTitle}>Update your goals?</Text>
              {review.goalUpdate && <Text style={kit.body}>{review.goalUpdate}</Text>}
              {newProjects.length > 0 && <Text style={kit.muted}>New projects in this plan: {newProjects.join(", ")}</Text>}
              <View style={kit.chips}>
                <Chip
                  label="Save to my goals"
                  onPress={() => {
                    if (review.goalUpdate) prefs.goalsText = `${prefs.goalsText.trim()}\n- ${review.goalUpdate}`.trim();
                    prefs.projects = [...prefs.projects, ...newProjects];
                    setProjects(prefs.projects);
                    setGoalSaved(true);
                  }}
                />
                <Chip label="Not now" onPress={() => setGoalSaved(true)} />
              </View>
            </Card>
          )}

          <SectionTitle>{`New tasks (${toCreate.length})`}</SectionTitle>
          {rows.map((r, i) => (
            <Card key={i} style={{ gap: spacing.sm }}>
              <View style={styles.rowTop}>
                <TextInput
                  value={r.task}
                  onChangeText={(t) => update(i, { task: t })}
                  style={[kit.input, { flex: 1 }]}
                  maxLength={200}
                  accessibilityLabel={`Task ${i + 1}`}
                />
                <TouchableOpacity onPress={() => setRows((all) => all.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove task ${i + 1}`} style={styles.iconBtn}>
                  <Ionicons name="close-circle-outline" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollChips}>
                <Text style={styles.label}>Project</Text>
                <Chip label="None" selected={!r.project} onPress={() => update(i, { project: null })} />
                {[...projects, ...(r.project && !projects.includes(r.project) ? [r.project] : [])].map((p) => (
                  <Chip key={p} label={p} selected={r.project === p} onPress={() => update(i, { project: p })} />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollChips}>
                <Text style={styles.label}>Due</Text>
                <Chip label="No date" selected={!r.due} onPress={() => update(i, { due: null })} />
                {[...days, ...(r.due && !days.includes(r.due) ? [r.due] : [])].map((d) => (
                  <Chip key={d} label={dayChip(d)} selected={r.due === d} onPress={() => update(i, { due: d })} />
                ))}
              </ScrollView>
            </Card>
          ))}
          <Button label="Add a task" kind="secondary" icon="add" onPress={() => setRows((all) => [...all, { project: null, task: "", due: null }])} />

          {carry.length > 0 && (
            <>
              <SectionTitle>{`Carrying over from last week (${carry.length})`}</SectionTitle>
              {carry.map((t) => (
                <Card key={t.id} style={{ gap: spacing.sm }}>
                  <Text style={kit.body}>{t.title}</Text>
                  {t.project && <Text style={kit.muted}>{t.project}</Text>}
                  <View style={kit.chips}>
                    {(["keep", "done", "drop"] as CarryChoice[]).map((c) => (
                      <Chip key={c} label={c === "keep" ? "Keep" : c === "done" ? "Already done" : "Let go"} selected={carryChoice[t.id] === c} onPress={() => setCarryChoice((all) => ({ ...all, [t.id]: c }))} />
                    ))}
                  </View>
                </Card>
              ))}
            </>
          )}

          <Button
            label={busy ? "Creating…" : `Create ${toCreate.length} ${toCreate.length === 1 ? "task" : "tasks"}`}
            icon="checkmark-done"
            onPress={approve}
            disabled={busy || (toCreate.length === 0 && Object.values(carryChoice).every((c) => c === "keep"))}
            style={{ marginTop: spacing.lg }}
          />
          <Button label="Change my plan" kind="quiet" onPress={() => setStep("draft")} />
        </ScrollView>
      </GlassScreen>
    );
  }

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.h1} accessibilityRole="header">What's your plan for the week?</Text>
        <Text style={kit.sub}>Talk it through roughly. We'll check it against your goals and turn it into tasks you approve.</Text>

        {!goals.trim() && (
          <Card style={{ gap: spacing.sm }}>
            <Text style={kit.body}>You haven't written your goals yet. Without them there is nothing to check the plan against.</Text>
            <Button label="Add my goals" kind="secondary" onPress={() => router.push("/goals")} />
          </Card>
        )}

        <View style={styles.rowTop}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={"e.g. Finish the thesis literature review by Friday, call mum, run on Wednesday, fix the login bug tomorrow…"}
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { flex: 1, minHeight: 200, textAlignVertical: "top" }]}
            multiline
            maxLength={6000}
            accessibilityLabel="My rough plan for the week"
          />
          <VoiceButton onTranscript={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} />
        </View>
        {carry.length > 0 && <Text style={kit.muted}>{carry.length} open {carry.length === 1 ? "task" : "tasks"} from last week will be shown separately.</Text>}

        <Button label={busy ? "Checking against your goals…" : "Check my plan"} icon="sparkles-outline" onPress={check} disabled={busy || draft.trim().length < 3} />
        {busy && <ActivityIndicator color={colors.accent} />}
        <Button label="Edit my goals" kind="quiet" onPress={() => router.push("/goals")} />
      </ScrollView>
    </GlassScreen>
  );
}

const styles = StyleSheet.create({
  flagCard: { borderColor: colors.warning, borderWidth: 1, backgroundColor: colors.warningBg },
  cardTitle: { ...typography.headline, color: colors.textPrimary },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scrollChips: { gap: spacing.sm, alignItems: "center", paddingRight: spacing.lg },
  label: { ...typography.footnote, color: colors.textSecondary, fontWeight: "600", width: 52 },
});
