/**
 * Beginora Design System — Apple HIG aligned
 *
 * Principles: Clarity · Deference · Depth
 * Palette: Calm sage + warm stone. No red urgency signals.
 * Typography: SF-style scale with proper optical sizing.
 * Touch targets: minimum 44pt per HIG.
 */

export const colors = {
  // ── Backgrounds ──────────────────────────────────
  bg:              "#F2F2F7",   // iOS systemGroupedBackground
  // Backdrop gradient, sage mist to warm stone; muted and accent text stay >= 4.66:1 on both.
  gradientTop:     "#EEF3EF",
  gradientBottom:  "#F6F2EA",
  surface:         "#FFFFFF",   // iOS secondarySystemGroupedBackground
  surfaceMuted:    "#F2F2F7",
  surfaceHover:    "#E5E5EA",   // iOS tertiarySystemFill

  // ── User messages ───────────────────────────────
  userBubble:      "#467565",   // Calm sage; white text 5.3:1
  userBubbleLight: "#6A9A8A",
  userText:        "#FFFFFF",

  // ── Assistant messages ──────────────────────────
  assistantBubble: "#FFFFFF",
  assistantText:   "#1C1C1E",   // iOS label

  // ── Accent (sage) ───────────────────────────────
  accent:          "#467565",   // 5.3:1 on surface, 4.7:1 on bg, 4.6:1 on accentMuted
  accentSoft:      "#C8D8D0",
  accentMuted:     "#EAF0ED",

  // ── Semantic ────────────────────────────────────
  success:         "#1F7A35",   // used as text: 5.4:1 (systemGreen #34C759 was 2.2:1)
  successBg:       "rgba(52,199,89,0.10)",
  error:           "#8B5E52",   // Warm brown — not alarming
  errorBg:         "rgba(139,94,82,0.10)",
  warning:         "#7D6428",   // 5.6:1 (was 2.7:1)
  warningBg:       "rgba(184,154,90,0.10)",
  info:            "#5A8FAA",

  // ── Text ────────────────────────────────────────
  textPrimary:     "#1C1C1E",   // iOS label
  textSecondary:   "#3C3C43",   // iOS secondaryLabel (60% opacity equivalent)
  textMuted:       "#6C6C70",   // 5.2:1 on surface, 4.7:1 on bg (#8E8E93 was 3.3:1)
  textPlaceholder: "#737378",   // 4.7:1 (was 1.7:1)

  // ── Borders & Separators ────────────────────────
  border:          "#C6C6C8",   // iOS separator
  borderLight:     "#E5E5EA",   // iOS opaqueSeparator
  divider:         "rgba(60,60,67,0.12)",

  // ── Misc ────────────────────────────────────────
  disabled:        "#C7C7CC",
  overlay:         "rgba(0,0,0,0.4)",
} as const;

// 8pt grid — matches iOS HIG spacing
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   18,
  xxl:  22,
  full: 999,
} as const;

// SF-style type scale — optical sizes match iOS Dynamic Type
export const typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: "700" as const,
    letterSpacing: 0.37,
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: "700" as const,
    letterSpacing: 0.36,
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: "700" as const,
    letterSpacing: 0.35,
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: "600" as const,
    letterSpacing: 0.38,
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: "600" as const,
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: "400" as const,
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: "400" as const,
    letterSpacing: -0.32,
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: "400" as const,
    letterSpacing: -0.24,
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: "400" as const,
    letterSpacing: -0.08,
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
    letterSpacing: 0,
    lineHeight: 16,
  },
  // Legacy aliases used across existing screens
  heading: {
    fontSize: 28,
    fontWeight: "700" as const,
    letterSpacing: 0.36,
    lineHeight: 34,
  },
  bodySmall: {
    fontSize: 15,
    fontWeight: "400" as const,
    letterSpacing: -0.24,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    letterSpacing: -0.08,
    textTransform: "uppercase" as const,
  },
  button: {
    fontSize: 17,
    fontWeight: "600" as const,
    letterSpacing: -0.41,
  },
} as const;

// Elevation — depth through shadow, not borders
export const shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
