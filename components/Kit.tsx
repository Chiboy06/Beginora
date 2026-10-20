// Small shared pieces for the planner, journal and routine screens. Every
// control has a text label, a 44pt touch area and an accessibility role.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, Vibration, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "../lib/theme";
import { MOODS } from "../lib/planner/moods";
import { addDays, dayLabel, monthGrid, REPEAT_LABELS, sameDay, startOfDay, timeLabel, weekDays } from "../lib/planner/schedule";
import type { Repeat } from "../lib/storage/database";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[kit.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={kit.sectionRow}>
      <Text style={kit.sectionTitle} accessibilityRole="header">{children}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" style={kit.sectionAction}>
          <Text style={kit.link}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Button({
  label, onPress, kind = "primary", icon, disabled, style,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = kind === "primary" ? colors.onAccent : kind === "danger" ? colors.error : kind === "quiet" ? colors.accent : colors.textPrimary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.75}
      style={[kit.button, kit[kind], disabled && kit.disabled, style]}
    >
      {icon && <Ionicons name={icon} size={18} color={color} />}
      <Text style={[kit.buttonText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[kit.chip, selected && kit.chipOn]}
    >
      <Text style={[kit.chipText, selected && kit.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function MoodPicker({ value, onChange, keys }: { value: string | null; onChange: (key: string) => void; keys?: string[] }) {
  const moods = keys ? MOODS.filter((m) => keys.includes(m.key)) : MOODS;
  return (
    <View style={kit.moodGrid}>
      {moods.map((m) => (
        <TouchableOpacity
          key={m.key}
          onPress={() => onChange(m.key)}
          accessibilityRole="button"
          accessibilityLabel={m.label}
          accessibilityState={{ selected: value === m.key }}
          style={[kit.mood, value === m.key && kit.moodOn]}
        >
          <Text style={kit.moodEmoji}>{m.emoji}</Text>
          <Text style={[kit.moodLabel, value === m.key && kit.moodLabelOn]}>{m.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Seven days with a dot (or an emoji) under days that have something.
export function WeekStrip({
  selected, onSelect, marks,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  marks: (d: Date) => string | boolean;
}) {
  const today = new Date();
  return (
    <View style={kit.weekRow}>
      {weekDays(selected).map((d) => {
        const on = sameDay(d, selected);
        const mark = marks(d);
        return (
          <TouchableOpacity
            key={d.toDateString()}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel(d, today)}${mark ? ", has items" : ""}`}
            accessibilityState={{ selected: on }}
            style={[kit.weekDay, on && kit.weekDayOn]}
          >
            <Text style={[kit.weekName, on && kit.weekTextOn]}>{d.toLocaleDateString(undefined, { weekday: "short" })}</Text>
            <Text style={[kit.weekNum, on && kit.weekTextOn, sameDay(d, today) && !on && { color: colors.accent }]}>{d.getDate()}</Text>
            {typeof mark === "string" ? <Text style={kit.weekEmoji}>{mark}</Text> : <View style={[kit.dot, !mark && { opacity: 0 }, on && { backgroundColor: colors.onAccent }]} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function MonthGrid({
  month, selected, onSelect, onMonth, marks,
}: {
  month: Date;
  selected: Date;
  onSelect: (d: Date) => void;
  onMonth: (d: Date) => void;
  marks: (d: Date) => number;
}) {
  const days = monthGrid(month.getFullYear(), month.getMonth());
  const today = new Date();
  return (
    <View>
      <View style={kit.monthHead}>
        <TouchableOpacity onPress={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} accessibilityRole="button" accessibilityLabel="Previous month" style={kit.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={kit.monthTitle} accessibilityRole="header">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
        <TouchableOpacity onPress={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityRole="button" accessibilityLabel="Next month" style={kit.iconBtn}>
          <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={kit.gridRow}>
        {weekDays(today).map((d) => (
          <Text key={d.getDay()} style={kit.gridHead}>{d.toLocaleDateString(undefined, { weekday: "narrow" })}</Text>
        ))}
      </View>
      <View style={kit.grid}>
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const on = sameDay(d, selected);
          const count = marks(d);
          return (
            <TouchableOpacity
              key={d.toDateString()}
              onPress={() => onSelect(d)}
              accessibilityRole="button"
              accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${count ? `, ${count} items` : ""}`}
              accessibilityState={{ selected: on }}
              style={[kit.cell, on && kit.cellOn]}
            >
              <Text style={[kit.cellText, !inMonth && { color: colors.textMuted }, sameDay(d, today) && !on && { color: colors.accent, fontWeight: "700" }, on && { color: colors.onAccent }]}>
                {d.getDate()}
              </Text>
              <View style={[kit.dot, !count && { opacity: 0 }, on && { backgroundColor: colors.onAccent }]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// A timer that counts by the clock, so a locked screen does not stop it. It
// ends with a short buzz, no sound.
export function StepTimer({ minutes, onFinish }: { minutes: number; onFinish?: () => void }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState(minutes * 60);
  const finished = useRef(false);

  useEffect(() => {
    setEndAt(null);
    setLeft(minutes * 60);
    finished.current = false;
  }, [minutes]);

  useEffect(() => {
    if (endAt === null) return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0 && !finished.current) {
        finished.current = true;
        setEndAt(null);
        Vibration.vibrate(250);
        onFinish?.();
      }
    }, 250);
    return () => clearInterval(tick);
  }, [endAt, onFinish]);

  const running = endAt !== null;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <View style={kit.timer}>
      <View style={kit.timerIcon}><Ionicons name="timer-outline" size={26} color={colors.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={kit.timerText} accessibilityLiveRegion="polite">{left === 0 ? "Time's up" : `${mm}:${ss}`}</Text>
        <Text style={kit.timerHint}>{running ? "Time left" : left === 0 ? "Stop or keep going, both are fine." : `${minutes} min`}</Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          if (running) { setLeft(Math.max(0, Math.round((endAt - Date.now()) / 1000))); setEndAt(null); }
          else { finished.current = false; setEndAt(Date.now() + (left === 0 ? minutes * 60 : left) * 1000); }
        }}
        accessibilityRole="button"
        accessibilityLabel={running ? "Pause timer" : "Start timer"}
        style={kit.timerBtn}
      >
        <Ionicons name={running ? "pause" : "play"} size={26} color={colors.onAccent} />
      </TouchableOpacity>
    </View>
  );
}

export interface Schedule {
  dueAt: number | null;
  repeat: Repeat;
  remind: boolean;
}

const TIMES = [9, 13, 18];

function withTime(day: Date, hour: number, minute = 0): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime();
}

// Day, time, repeat and reminder for a task. No time means "sort later".
export function ScheduleFields({ value, onChange }: { value: Schedule; onChange: (v: Schedule) => void }) {
  const now = new Date();
  const due = value.dueAt !== null ? new Date(value.dueAt) : null;
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(startOfDay(due ?? now));
  const [typed, setTyped] = useState("");

  const setDay = (day: Date | null) => {
    setPicking(false);
    if (!day) return onChange({ ...value, dueAt: null, repeat: "never" });
    onChange({ ...value, dueAt: withTime(day, due ? due.getHours() : 9, due ? due.getMinutes() : 0) });
  };
  const setClock = (hour: number, minute = 0) => onChange({ ...value, dueAt: withTime(due ?? now, hour, minute) });

  const days: { label: string; day: Date | null }[] = [
    { label: "Sort later", day: null },
    { label: "Today", day: now },
    { label: "Tomorrow", day: addDays(now, 1) },
    { label: "Next week", day: addDays(now, 7) },
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={kit.fieldLabel}>Day</Text>
      <View style={kit.chips}>
        {days.map((d) => (
          <Chip key={d.label} label={d.label} selected={d.day ? !!due && sameDay(due, d.day) : !due} onPress={() => setDay(d.day)} />
        ))}
        <Chip label={due && !days.some((d) => d.day && sameDay(due, d.day)) ? dayLabel(due) : "Pick a day"} selected={picking} onPress={() => setPicking((p) => !p)} />
      </View>
      {picking && (
        <Card>
          <MonthGrid month={month} selected={due ?? now} onMonth={setMonth} onSelect={(d) => setDay(d)} marks={() => 0} />
        </Card>
      )}
      {due && (
        <>
          <Text style={kit.fieldLabel}>Time</Text>
          <View style={kit.chips}>
            {TIMES.map((h) => (
              <Chip key={h} label={timeLabel(new Date(2000, 0, 1, h))} selected={due.getHours() === h && due.getMinutes() === 0} onPress={() => setClock(h)} />
            ))}
            <TextInput
              value={typed}
              onChangeText={(t) => {
                setTyped(t);
                const m = /^(\d{1,2})[:.](\d{2})$/.exec(t.trim());
                if (m && Number(m[1]) < 24 && Number(m[2]) < 60) setClock(Number(m[1]), Number(m[2]));
              }}
              placeholder="hh:mm"
              placeholderTextColor={colors.textPlaceholder}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Type a time, for example 18:30"
              style={kit.timeInput}
              maxLength={5}
            />
          </View>
          <Text style={kit.summary}>{dayLabel(due)} · {timeLabel(due)}</Text>
          <Text style={kit.fieldLabel}>Repeat</Text>
          <View style={kit.chips}>
            {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
              <Chip key={r} label={REPEAT_LABELS[r]} selected={value.repeat === r} onPress={() => onChange({ ...value, repeat: r })} />
            ))}
          </View>
          <View style={kit.switchRow}>
            <Text style={kit.switchLabel}>Remind me at this time</Text>
            <Switch
              value={value.remind}
              onValueChange={(remind) => onChange({ ...value, remind })}
              trackColor={{ true: colors.accent, false: colors.border }}
              accessibilityLabel="Remind me at this time"
            />
          </View>
        </>
      )}
    </View>
  );
}

export const kit = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { ...typography.headline, color: colors.textPrimary },
  sectionAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  link: { ...typography.subheadline, color: colors.accent, fontWeight: "600" },
  button: {
    minHeight: 50,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quiet: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent" },
  disabled: { opacity: 0.45 },
  buttonText: { ...typography.button, fontSize: 16 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...typography.subheadline, color: colors.textPrimary, fontWeight: "600" },
  chipTextOn: { color: colors.onAccent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  mood: {
    width: "23%",
    minWidth: 72,
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  moodOn: { borderColor: colors.accent, backgroundColor: colors.accentMuted, borderWidth: 2 },
  moodEmoji: { fontSize: 28 },
  moodLabel: { ...typography.footnote, color: colors.textSecondary, marginTop: 4, fontWeight: "600" },
  moodLabelOn: { color: colors.textPrimary },
  weekRow: { flexDirection: "row", gap: 4 },
  weekDay: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radii.lg, minHeight: 64, gap: 2 },
  weekDayOn: { backgroundColor: colors.accent },
  weekName: { ...typography.caption, color: colors.textMuted, fontWeight: "600" },
  weekNum: { ...typography.headline, color: colors.textPrimary },
  weekTextOn: { color: colors.onAccent },
  weekEmoji: { fontSize: 14, lineHeight: 16 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 4 },
  monthHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthTitle: { ...typography.headline, color: colors.textPrimary },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  gridRow: { flexDirection: "row" },
  gridHead: { flex: 1, textAlign: "center", ...typography.caption, color: colors.textMuted, fontWeight: "600", marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center", borderRadius: radii.md },
  cellOn: { backgroundColor: colors.accent },
  cellText: { ...typography.callout, color: colors.textPrimary },
  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  timerIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center" },
  timerText: { fontSize: 34, fontWeight: "700", color: colors.textPrimary, fontVariant: ["tabular-nums"] },
  timerHint: { ...typography.footnote, color: colors.textSecondary },
  timerBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  fieldLabel: { ...typography.footnote, color: colors.textSecondary, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  timeInput: {
    minHeight: 40,
    minWidth: 76,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    backgroundColor: colors.field,
    ...typography.subheadline,
  },
  summary: { ...typography.callout, color: colors.accent, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  switchLabel: { ...typography.body, color: colors.textPrimary, flex: 1 },
  input: {
    minHeight: 50,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.field,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    ...typography.body,
  },
  screenPad: { padding: spacing.xl, paddingBottom: 120 },
  h1: { ...typography.title1, color: colors.textPrimary },
  sub: { ...typography.subheadline, color: colors.textSecondary, marginTop: 4 },
  body: { ...typography.body, color: colors.textPrimary },
  muted: { ...typography.footnote, color: colors.textMuted },
});
