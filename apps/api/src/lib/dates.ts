/**
 * Postgres DATE columns (`@db.Date`) arrive from Prisma as JS Dates at UTC
 * midnight. These convert between them and the domain's PlainDate strings
 * without any time zone shifting.
 */
import { type PlainDate, parsePlainDate } from "@tenara/domain";

export function dbDateToPlain(value: Date): PlainDate {
  return parsePlainDate(value.toISOString().slice(0, 10));
}

export function plainToDbDate(date: PlainDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
