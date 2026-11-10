/**
 * Renders the brand SVGs in assets/brand/titan-household to the PNG files
 * Expo needs. Run after changing an icon: `pnpm --filter @titan/mobile icons`.
 * The generated PNGs are committed, so builds don't need this step.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const brandDir = fileURLToPath(new URL("../../../assets/brand/titan-household/", import.meta.url));
const outDir = fileURLToPath(new URL("../assets/generated/", import.meta.url));
mkdirSync(outDir, { recursive: true });

const outputs = [
  { source: "icon.svg", file: "icon.png", size: 1024 }, // iOS / store icon (unrounded)
  { source: "adaptive-foreground.svg", file: "adaptive-foreground.png", size: 1024 },
  { source: "adaptive-background.svg", file: "adaptive-background.png", size: 1024 },
  { source: "icon-preview.svg", file: "splash-icon.png", size: 512 },
  { source: "icon-preview.svg", file: "favicon.png", size: 48 },
] as const;

for (const { source, file, size } of outputs) {
  const svg = readFileSync(brandDir + source, "utf8");
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(outDir + file, png);
  console.log(`${file} (${size}x${size}) from ${source}`);
}
