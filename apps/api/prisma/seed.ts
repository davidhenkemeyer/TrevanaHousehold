/**
 * Local demo data: the design doc's example family (Mom, Dad, Billy, Sally).
 * Run with `pnpm --filter @chores/api db:seed`. Safe to re-run: it does
 * nothing if the demo family already exists.
 *
 *   Parents sign in with mom@example.com / dad@example.com, password "chores-demo-password".
 *   Billy's PIN is 1111, Sally's is 2222.
 */
import { defaultAvatarColor, defaultWeeklyCapacity } from "@chores/domain";
import { createDb } from "../src/db.js";
import { hashSecret } from "../src/lib/secrets.js";

const DEMO_PASSWORD = "chores-demo-password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set (copy apps/api/.env.example to .env)");
const db = createDb(databaseUrl);

try {
  if (await db.user.findUnique({ where: { email: "mom@example.com" } })) {
    console.log("Demo family already exists; nothing to do.");
  } else {
    const passwordHash = await hashSecret(DEMO_PASSWORD);
    const family = await db.family.create({
      data: { name: "The Example Family", timeZone: "America/Chicago" },
    });
    const people = [
      { displayName: "Mom", email: "mom@example.com", role: "PARENT" as const },
      { displayName: "Dad", email: "dad@example.com", role: "PARENT" as const },
      { displayName: "Billy", pin: "1111", role: "CHILD" as const },
      { displayName: "Sally", pin: "2222", role: "CHILD" as const },
    ];
    for (const [i, person] of people.entries()) {
      await db.membership.create({
        data: {
          role: person.role,
          capacity: defaultWeeklyCapacity(person.role),
          pinHash: "pin" in person ? await hashSecret(person.pin) : null,
          family: { connect: { id: family.id } },
          user: {
            create: {
              displayName: person.displayName,
              avatarColor: defaultAvatarColor(i),
              ...("email" in person && { email: person.email, passwordHash }),
            },
          },
        },
      });
    }
    console.log(`Created "${family.name}" (${family.id}) with Mom, Dad, Billy, and Sally.`);
  }
} finally {
  await db.$disconnect();
}
