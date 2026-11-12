/**
 * Scheduled planning: keeps every family's next 7 days of occurrences in place
 * as the window rolls forward. Planning is idempotent, so this runs hourly
 * rather than at each family's local midnight: every run after midnight
 * plans the newly visible day, and the other runs create nothing. It also
 * reminds parents, once, three days before their Pro trial ends.
 */
import type { FastifyBaseLogger } from "fastify";
import type { Deps } from "../deps.js";
import { planFamily } from "../modules/instances/generate.js";
import { remindTrialEnding } from "../modules/plans/service.js";

export interface PlanningSummary {
  families: number;
  created: number;
  failed: number;
}

export async function planAllFamilies(
  deps: Pick<Deps, "db" | "now">,
  log: Pick<FastifyBaseLogger, "info" | "warn" | "error">,
): Promise<PlanningSummary> {
  const families = await deps.db.family.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  const summary: PlanningSummary = { families: families.length, created: 0, failed: 0 };

  for (const { id } of families) {
    try {
      // One transaction per family: a problem in one family never blocks the others.
      const result = await deps.db.$transaction(async (tx) => {
        await remindTrialEnding(tx, id, deps.now());
        return planFamily(tx, id, deps.now());
      });
      summary.created += result.created;
      if (result.unassigned.length > 0 || result.invalidChoreIds.length > 0) {
        log.warn(
          { familyId: id, unassigned: result.unassigned, invalidChoreIds: result.invalidChoreIds },
          "Some occurrences could not be planned",
        );
      }
    } catch (error) {
      summary.failed++;
      log.error({ err: error, familyId: id }, "Planning failed for family");
    }
  }
  log.info(summary, "Planning run finished");
  return summary;
}
