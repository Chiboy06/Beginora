// My goals: written or spoken once, used every week to check the plan.
// Projects group tasks. The Monday check-in opens the weekly plan.

import { useState } from "react";
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Chip, SectionTitle, kit } from "../components/Kit";
import { GlassScreen } from "../components/GlassSurface";
import { VoiceButton } from "../components/VoiceButton";
import { prefs } from "../lib/store/prefs";
import { setWeeklyCheckIn } from "../lib/planner/weekly-checkin";
import { colors, radii, spacing } from "../lib/theme";

export default function GoalsScreen() {
  const router = useRouter();
  const [goals, setGoals] = useState(prefs.goalsText);
  const [projects, setProjects] = useState(prefs.projects);
  const [newProject, setNewProject] = useState("");
  const [checkIn, setCheckIn] = useState(prefs.weeklyCheckIn);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const addProject = () => {
    const name = newProject.trim();
    if (!name) return;
    setProjects((all) => (all.some((p) => p.toLowerCase() === name.toLowerCase()) ? all : [...all, name.slice(0, 40)]));
    setNewProject("");
  };

  const save = () => {
    prefs.goalsText = goals;
    prefs.projects = projects;
    setProjects(prefs.projects);
    setMessage({ ok: true, text: "Saved. Your weekly plan will be checked against these." });
  };

  const changeCheckIn = async (enabled: boolean, hour: number) => {
    const result = await setWeeklyCheckIn(enabled, hour);
    setCheckIn(prefs.weeklyCheckIn);
    setMessage({ ok: result.ok, text: result.message });
  };

  return (
    <GlassScreen>
      <ScrollView contentContainerStyle={[kit.screenPad, { gap: spacing.md }]} keyboardShouldPersistTaps="handled">
        <Text style={kit.sub}>
          Talk for a few minutes about your goals for this year or this quarter, your projects and how you like to work. Don't polish it. Tap the microphone to speak.
        </Text>
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <TextInput
            value={goals}
            onChangeText={setGoals}
            placeholder={"e.g. Finish my thesis by June. Get fit: run twice a week. Launch Beginora for my hackathon. I work best in the morning."}
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { flex: 1, minHeight: 180, textAlignVertical: "top" }]}
            multiline
            maxLength={4000}
            accessibilityLabel="My goals"
          />
          <VoiceButton onTranscript={(t) => setGoals((g) => (g ? `${g} ${t}` : t))} />
        </View>

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
            onSubmitEditing={addProject}
            placeholder="New project, e.g. Thesis"
            placeholderTextColor={colors.textPlaceholder}
            style={[kit.input, { flex: 1 }]}
            maxLength={40}
            returnKeyType="done"
            accessibilityLabel="New project name"
          />
          <Button label="Add" kind="secondary" onPress={addProject} disabled={!newProject.trim()} />
        </View>

        <Button label="Save goals" onPress={save} style={{ marginTop: spacing.md }} />

        <SectionTitle>Monday check-in</SectionTitle>
        <Card style={{ gap: spacing.md }}>
          <View style={kit.switchRow}>
            <Text style={kit.switchLabel}>Every Monday, ask me for my plan for the week</Text>
            <Switch
              value={checkIn.enabled}
              onValueChange={(v) => void changeCheckIn(v, checkIn.hour)}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="Monday check-in"
            />
          </View>
          {checkIn.enabled && (
            <View style={kit.chips}>
              {[7, 8, 9, 10, 18].map((h) => (
                <Chip key={h} label={`${String(h).padStart(2, "0")}:00`} selected={checkIn.hour === h} onPress={() => void changeCheckIn(true, h)} />
              ))}
            </View>
          )}
        </Card>

        {message && <Text style={{ color: message.ok ? colors.success : colors.error }} accessibilityLiveRegion="polite">{message.text}</Text>}
        <Button label="Plan my week now" kind="quiet" icon="calendar-outline" onPress={() => router.push("/weekly-plan")} />
      </ScrollView>
    </GlassScreen>
  );
}
