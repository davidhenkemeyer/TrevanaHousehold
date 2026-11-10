/**
 * Opaque pagination cursors: the sort key of the last item on a page, as
 * base64url JSON. Clients pass `nextCursor` back unchanged. A tampered or
 * malformed cursor is a 400, never a crash.
 */
import type { z } from "zod";
import { badRequest } from "../errors.js";

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  throw badRequest(
    "INVALID_CURSOR",
    "The pagination cursor is invalid. Start from the first page.",
  );
}
