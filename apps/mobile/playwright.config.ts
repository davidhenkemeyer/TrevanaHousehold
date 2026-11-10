/**
 * Web smoke test: drives the exported web app in the installed Microsoft
 * Edge (no browser download). Needs the API on :3000 and the web app on
 * :8081 (`pnpm --filter @titan/api dev` and `pnpm --filter @titan/mobile web`).
 * Run with `pnpm --filter @titan/mobile e2e`. Screenshots land in e2e/output.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/output/results",
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8081",
    channel: "msedge",
    viewport: { width: 430, height: 900 }, // phone-sized
    trace: "retain-on-failure",
  },
});
