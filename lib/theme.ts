/**
 * Beginora Design System
 *
 * Tone: Calm, respectful, practical, non-clinical.
 * Palette: Soft sage + warm stone. No red urgency signals.
 * Audience: People who struggle with task initiation — nothing should feel
 * pressuring, alarming, or overwhelming.
 */

export const colors = {
  // ── Backgrounds ──────────────────────────────────
  bg:              "#F7F4EF",   // Warm linen
  surface:         "#FFFFFF",   // Cards, header, input
  surfaceMuted:    "#EFF0EB",   // Assistant bubbles
  surfaceHover:    "#E8E9E3",   // Pressed states

  // ── User messages ───────────────────────────────
  userBubble:      "#5C7A6B",   // Calm sage green
  userBubbleLight: "#7A9A8A",
  userText:        "#FFFFFF",

  // ── Assistant messages ──────────────────────────
  assistantBubble: "#EFF0EB",   // Soft stone
  assistantText:   "#2E3028",   // Deep warm near-black

  // ── Accent (sage / focus) ───────────────────────
  accent:          "#5C7A6B",   // Sage — calm, not urgent
  accentSoft:      "#C8D8D0",   // Light sage tint
  accentMuted:     "#E4EDE8",   // Very light sage bg

  // ── Semantic — no red for errors (too alarming) ─
  success:         "#6A9E7F",   // Muted green
  successBg:       "rgba(106,158,127,0.12)",
  error:           "#A07060",   // Warm brown-red (not alarming)
  errorBg:         "rgba(160,112,96,0.10)",
  warning:         "#B89A5A",   // Warm amber
  warningBg:       "rgba(184,154,90,0.12)",
  info:            "#7A9AB0",   // Dusty blue

  // ── Text ────────────────────────────────────────
  textPrimary:     "#2E3028",   // Near black, warm
  textSecondary:   "#6B6E62",   // Warm medium gray
  textMuted:       "#9A9D90",   // Warm light gray
  textPlaceholder: "#BEC0B5",   // Subtle

  // ── Borders & Dividers ──────────────────────────
  border:          "#DFE0D8",   // Warm border
  borderLight:     "#EFF0EB",   // Subtle divider
  divider:         "rgba(46,48,40,0.06)",

  // ── Misc ────────────────────────────────────────
  disabled:        "#CCCEC5",
  overlay:         "rgba(46,48,40,0.4)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 22,
  full: 999,
} as const;

export const typography = {
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
  },
  heading: {
    fontSize: 26,
    fontWeight: "700" as const,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    letterSpacing: 1.1,
    textTransform: "uppercase" as const,
  },
  button: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
} as const;
