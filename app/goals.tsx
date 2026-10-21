// My goals, following "Plan your week": talk through your goals, summarise
// them, keep the planning guide saved after them, and schedule the
// weekly-plan routine that asks for your plan each week.

import { useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Chip, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { VoiceButton } from "../components/VoiceButton";
import { prefs } from "../lib/store/prefs";
import { saveMemory } from "../lib/storage/database";
import { setWeeklyCheckIn, WEEKDAY_NAMES } from "../lib/planner/weekly-checkin";
import { summariseGoals } from "../lib/planner/weekly-ai";
import { CHECK_IN_QUESTION, DEFAULT_GUIDE } from "../lib/planner/weekly";
import { colors, radii, spacing } from "../lib/theme";

// One fixed id, so saving again replaces the memory instead of adding another.
const GOALS_MEMORY_ID = "user-goals";

export default function GoalsScreen() {
  const router = useRouter();
  const [goals, setGoals] = useState(prefs.goalsText);
  const [projects, setProjects] = useState(prefs.projects);
  const [newProject, setNewProject] = useState("");
  const [guide, setGuide] = useState(prefs.planningGuide || DEFAULT_GUIDE);
  const [checkIn, setCheckIn] = useState(prefs.weeklyCheckIn);
  const [summary, setSummary] = useState<{ summary: string; projects: string[] } | null>(null);
  const [summarising, setSummarising] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const addProjects = (names: string[]) =>
    setProjects((all) => [...all, ...names.filter((n) => n.trim() && !all.some((p) => p.toLowerCase() === n.trim().toLowerCase())).map((n) => n.trim().slice(0, 40))]);

  const summarise = async () => {
    setSummarising(true);
    setMessage(null);
    const result = await summariseGoals(goals).catch(() => null);
    setSummarising(false);
    if (result) setSummary(result);
    else setMessage({ ok: false, text: "Summarising needs the online model or a phone model of 1.5B or more. Your words are kept as you said them." });
  };

  const save = async () => {
    prefs.goalsText = goals;
    prefs.projects = projects;
    setProjects(prefs.projects);
    // The default guide is stored as empty, so later improvements to it apply.
    prefs.planningGuide = guide.trim() === DEFAULT_GUIDE ? "" : guide.trim();
    // Also a memory, so Talk knows your goals when you ask about yourself.
    if (goals.trim()) {
      await saveMemory({ id: GOALS_MEMORY_ID, category: "fact", content: `The user's goals: ${goals.replace(/\s+/g, " ").trim().slice(0, 450)}` }).catch(() => {});
    }
    setMessage({ ok: true, text: "Saved. Your weekly plan will be checked against your goals with this guide." });
  };

  const changeCheckIn = async (enabled: boolean, hour: number, weekday: number) => {
    const result = await setWeeklyCheckIn(enabled, hour, weekday);
    setCheckIn(prefs.weeklyCheckIn);
    setMessage({ ok: result.ok, text: result.message });
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <SectionTitle>1. Tell Beginora your goals</SectionTitle>
        <Text style={kit.muted}>
          Tap the microphone and talk for a few minutes about your goals for this year or quarter, your projects and how you work. Don't polish it.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <TextInput
            value={goals}
            onChangeText={setGoals}
            placeholder={"e.g. Finish my thesis by June. Run twice a week. Launch Beginora. I work best in the morning."}
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { flex: 1, minHeight: 180, textAlignVertical: "top" }]}
            multiline
            maxLength={4000}
            accessibilityLabel="My goals"
          />
          <VoiceButton onTranscript={(t) => setGoals((g) => (g ? `${g} ${t}` : t))} />
        </View>
        <Button label={summarising ? "Summarising…" : "Summarise my goals"} kind="secondary" icon="sparkles-outline" onPress={summarise} disabled={summarising || goals.trim().length < 20} />
        {summarising && <ActivityIndicator color={colors.accent} />}

        {summary && (
          <Card style={{ gap: spacing.sm, borderColor: colors.accent, borderWidth: 1 }}>
            <Text style={[kit.body, { fontWeight: "700" }]}>Summary</Text>
            <Text style={kit.body}>{summary.summary}</Text>
            {summary.projects.length > 0 && <Text style={kit.muted}>Projects found: {summary.projects.join(", ")}</Text>}
            <View style={kit.chips}>
              <Chip label="Use this summary" onPress={() => { setGoals(summary.summary); addProjects(summary.projects); setSummary(null); }} />
              <Chip label="Keep my words" onPress={() => setSummary(null)} />
            </View>
          </Card>
        )}

        <SectionTitle>Projects</SectionTitle>
        <Text style={kit.muted}>Tasks from your weekly plan are grouped by these.</Text>
        <View style={kit.chips}>
          {projects.map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setProjects((all) => all.filter((x) => x !== p))}
              accessibilityRole="button"
              accessibilityLabel={`Remove project ${p}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.full, backgroundColor: colors.accentMuted }}
            >
              <Text style={[kit.body, { fontWeight: "600" }]}>{p}</Text>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput
            value={newProject}
            onChangeText={setNewProject}
            onSubmitEditing={() => { addProjects([newProject]); setNewProject(""); }}
            placeholder="New project, e.g. Thesis"
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { flex: 1 }]}
            maxLength={40}
            returnKeyType="done"
            accessibilityLabel="New project name"
          />
          <Button label="Add" kind="secondary" onPress={() => { addProjects([newProject]); setNewProject(""); }} disabled={!newProject.trim()} />
        </View>

        <SectionTitle>2. Your planning guide</SectionTitle>
        <Text style={kit.muted}>Saved after your goals. Beginora follows it every week when it checks your plan. You can change it.</Text>
        <TextInput
          value={guide}
          onChangeText={setGuide}
          style={[kit.input, { minHeight: 170, textAlignVertical: "top" }]}
          multiline
          maxLength={2000}
          accessibilityLabel="Planning guide"
        />
        {guide.trim() !== DEFAULT_GUIDE && <Button label="Reset the guide" kind="quiet" onPress={() => setGuide(DEFAULT_GUIDE)} />}

        <Button label="Save goals and guide" onPress={save} style={{ marginTop: spacing.sm }} />

        <SectionTitle>3. The weekly-plan routine</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <View style={kit.switchRow}>
            <Text style={kit.switchLabel}>weekly-plan · every {WEEKDAY_NAMES[checkIn.weekday - 1]}, {String(checkIn.hour).padStart(2, "0")}:00</Text>
            <Switch
              value={checkIn.enabled}
              onValueChange={(v) => void changeCheckIn(v, checkIn.hour, checkIn.weekday)}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="weekly-plan routine"
            />
          </View>
          <Text style={kit.muted}>Instructions: don't touch my tasks or do anything else. Just ask: "{CHECK_IN_QUESTION}" Then wait for my draft.</Text>
          <Text style={kit.muted}>Day</Text>
          <View style={kit.chips}>
            {[2, 3, 4, 5, 6, 7, 1].map((d) => (
              <Chip key={d} label={WEEKDAY_NAMES[d - 1].slice(0, 3)} selected={checkIn.weekday === d} onPress={() => void changeCheckIn(checkIn.enabled, checkIn.hour, d)} />
            ))}
          </View>
          <Text style={kit.muted}>Time</Text>
          <View style={kit.chips}>
            {[7, 8, 9, 10, 18].map((h) => (
              <Chip key={h} label={`${String(h).padStart(2, "0")}:00`} selected={checkIn.hour === h} onPress={() => void changeCheckIn(checkIn.enabled, h, checkIn.weekday)} />
            ))}
          </View>
          <Text style={kit.muted}>It runs on this phone, so it works offline and with no computer on.</Text>
        </Card>

        {message && <Text style={{ color: message.ok ? colors.success : colors.error }} accessibilityLiveRegion="polite">{message.text}</Text>}
        <Button label="4. Plan my week now" kind="quiet" icon="calendar-outline" onPress={() => router.push("/weekly-plan")} />
      </ScrollView>
    </GlassScreen>
  );
}
