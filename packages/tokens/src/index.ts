/**
 * @titan/tokens: the Titan design system's tokens (Titan Branding Suite §7).
 *
 * Shared by every Titan app. Each app picks its accent palette through
 * `themeFor(app)`; components read semantic roles (`colors.primary`,
 * `colors.textMuted`, ...) and never hard-code hex values.
 */

/** Core neutral palette shared by the whole suite (§7.1). */
export const neutrals = {
  slate900: "#0F172A", // primary text, dark surfaces
  slate700: "#334155", // secondary text, muted labels
  slate100: "#F1F5F9", // surface backgrounds, container fills
  white: "#FFFFFF", // card bodies, primary containers
  border: "#E2E8F0", // card borders (§7.4)
} as const;

/** Per-app accent palettes (§7.1). */
export const accents = {
  household: {
    amber: "#D97706", // Warm Amber
    emerald: "#059669", // Soft Emerald
    sky: "#0284C7", // Playful Sky Blue
  },
  agile: {
    slate: "#1E293B", // Deep Slate
    indigo: "#4F46E5", // Electric Indigo
    cyan: "#06B6D4", // Cyan Accent
  },
  focus: {
    violet: "#7C3AED", // Zen Violet
    teal: "#0D9488", // Calming Teal
    coral: "#F43F5E", // Coral Energy
  },
} as const;

export type TitanApp = keyof typeof accents;

/** Font families (§7.2). Loaded by each app; these are the names it registers them under. */
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "RobotoMono_500Medium",
} as const;

/** Type scale (§7.2), in px. Line heights are absolute px for React Native. */
export const typography = {
  display: { fontSize: 36, lineHeight: 41, fontFamily: fonts.bold },
  h1: { fontSize: 24, lineHeight: 29, fontFamily: fonts.bold },
  h2: { fontSize: 20, lineHeight: 25, fontFamily: fonts.semiBold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: fonts.semiBold },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: fonts.medium },
  /** Badges, chips, checklist counters (§7.4: 0.75rem monospace). */
  mono: { fontSize: 12, lineHeight: 16, fontFamily: fonts.mono },
} as const;

/** 4 px base spacing scale. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Corner radii (§7.4). */
export const radii = { button: 8, card: 12, pill: 9999 } as const;

/** Card shadow (§7.4: 0 4px 6px -1px rgba(0,0,0,0.1)), in React Native terms plus CSS for web. */
export const shadows = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    css: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
} as const;

/** Interaction states (§7.4). */
export const interaction = {
  pressedScale: 0.98,
  hoverBrightness: 1.05,
  focusRingWidth: 2,
  focusRingOffset: 2,
  ghostOverlayOpacity: 0.1,
  buttonBorderWidth: 1.5,
} as const;

/** Semantic colors components use. */
export interface ThemeColors {
  /** Main accent: primary buttons, focus rings, active tabs. */
  primary: string;
  /** Text and icons on top of `primary`. */
  onPrimary: string;
  /** Positive outcomes: done, approved, progress. */
  success: string;
  /** Informational accents: links, "waiting for review". */
  info: string;
  /** Needs attention: late, rework (from the app's warm accent). */
  attention: string;
  /** Destructive actions and errors. */
  danger: string;
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  /** Two-stop brand gradient (135°), e.g. for headers and the app icon. */
  gradient: readonly [string, string];
}

export interface Theme {
  app: TitanApp;
  colors: ThemeColors;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
  shadows: typeof shadows;
  interaction: typeof interaction;
}

const DANGER = "#DC2626";

const appColors: Record<TitanApp, ThemeColors> = {
  household: {
    primary: accents.household.emerald,
    onPrimary: neutrals.white,
    success: accents.household.emerald,
    info: accents.household.sky,
    attention: accents.household.amber,
    danger: DANGER,
    background: neutrals.slate100,
    surface: neutrals.white,
    border: neutrals.border,
    text: neutrals.slate900,
    textMuted: neutrals.slate700,
    gradient: [accents.household.amber, accents.household.emerald],
  },
  agile: {
    primary: accents.agile.indigo,
    onPrimary: neutrals.white,
    success: "#059669",
    info: accents.agile.cyan,
    attention: "#D97706",
    danger: DANGER,
    background: neutrals.slate100,
    surface: neutrals.white,
    border: neutrals.border,
    text: neutrals.slate900,
    textMuted: neutrals.slate700,
    gradient: [accents.agile.slate, accents.agile.indigo],
  },
  focus: {
    primary: accents.focus.violet,
    onPrimary: neutrals.white,
    success: accents.focus.teal,
    info: accents.focus.teal,
    attention: accents.focus.coral,
    danger: DANGER,
    background: neutrals.slate100,
    surface: neutrals.white,
    border: neutrals.border,
    text: neutrals.slate900,
    textMuted: neutrals.slate700,
    gradient: [accents.focus.violet, accents.focus.teal],
  },
};

export function themeFor(app: TitanApp): Theme {
  return {
    app,
    colors: appColors[app],
    typography,
    spacing,
    radii,
    shadows,
    interaction,
  };
}
