import { describe, expect, it } from "vitest";
import { accents, neutrals, themeFor } from "./index.js";

/** WCAG relative luminance contrast ratio between two hex colors. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("tokens", () => {
  it("uses the branding doc's Family palette", () => {
    expect(accents.family).toEqual({ amber: "#D97706", emerald: "#059669", sky: "#0284C7" });
    expect(themeFor("family").colors.gradient).toEqual(["#D97706", "#059669"]);
  });

  it.each(["family", "team", "focus"] as const)("%s text is readable (WCAG AA)", (app) => {
    const { colors } = themeFor(app);
    expect(contrast(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textMuted, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.text, neutrals.slate100)).toBeGreaterThanOrEqual(4.5);
    // White on the primary accent is button text: at least AA for large/bold text.
    expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(3);
  });
});
