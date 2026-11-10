import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Local runs read TEST_DATABASE_URL from apps/api/.env; CI sets it directly.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/globalSetup.ts"],
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
