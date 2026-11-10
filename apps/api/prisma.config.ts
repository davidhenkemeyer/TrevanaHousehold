// Prisma CLI configuration (migrate, generate, seed). The app itself reads
// DATABASE_URL in src/config.ts; this file only serves the CLI.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Load apps/api/.env for local CLI runs. CI and production set real env vars.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `generate` doesn't need a database; give it a harmless placeholder.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder@localhost:5432/placeholder",
  },
});
