export function testDatabaseUrl(): string {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://chores:chores@localhost:5432/chores_test";
  // Guard against wiping a real database: the test DB name must say "test".
  if (!new URL(url).pathname.includes("test")) {
    throw new Error(`TEST_DATABASE_URL must point at a test database, got ${url}`);
  }
  return url;
}
