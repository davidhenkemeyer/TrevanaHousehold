import { themeFor } from "@titan/tokens";

/** The app's theme: Titan Household palette on the shared Titan tokens. */
export const theme = themeFor("household");
export const { colors, typography, spacing, radii, shadows, interaction } = theme;

/** Card shadow for both native (shadow* / elevation) and web (boxShadow). */
export const cardShadow = {
  shadowColor: shadows.card.shadowColor,
  shadowOffset: shadows.card.shadowOffset,
  shadowOpacity: shadows.card.shadowOpacity,
  shadowRadius: shadows.card.shadowRadius,
  elevation: shadows.card.elevation,
} as const;
