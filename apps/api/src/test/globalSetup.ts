/**
 * Runs once before all API tests: creates the test database if needed and
 * applies migrations to it. Requires Postgres to be running (`pnpm db:up`).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDb } from "../db.js";
import { testDatabaseUrl } from "./testDatabase.js";

export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Refusing to create test database with unusual name "${dbName}"`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = createDb(adminUrl.toString());
  try {
    const rows = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } catch (error) {
    throw new Error(`Can't reach Postgres for tests at ${url.host}. Is it running? (pnpm db:up)`, {
      cause: error,
    });
  } finally {
    await admin.$disconnect();
  }

  const apiDir = fileURLToPath(new URL("../../", import.meta.url));
  const prismaCli = fileURLToPath(
    new URL("../../node_modules/prisma/build/index.js", import.meta.url),
  );
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
}
