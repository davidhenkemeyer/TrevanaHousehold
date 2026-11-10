import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the app's plain-TypeScript logic (API client, session
// handling, Today grouping). Screens are checked through the web build.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
