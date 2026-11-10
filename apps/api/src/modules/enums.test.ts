/**
 * The database enums and the domain's constants must list exactly the same
 * values, or a status could exist in one place and not the other.
 */
import {
  ASSIGN_MODES,
  CHORE_STATUSES,
  PRIORITIES,
  REVIEW_DECISIONS,
  REVIEW_POLICIES,
  ROLES,
} from "@titan/domain";
import { describe, expect, it } from "vitest";
import {
  AssignMode,
  ChoreStatus,
  Priority,
  ReviewAction,
  ReviewPolicy,
  Role,
} from "../generated/prisma/enums.js";

describe("Prisma enums match the domain", () => {
  it.each([
    ["ChoreStatus", ChoreStatus, CHORE_STATUSES],
    ["Priority", Priority, PRIORITIES],
    ["AssignMode", AssignMode, ASSIGN_MODES],
    ["ReviewPolicy", ReviewPolicy, REVIEW_POLICIES],
    ["ReviewAction", ReviewAction, REVIEW_DECISIONS],
    ["Role", Role, ROLES],
  ] as const)("%s", (_name, prismaEnum, domainValues) => {
    expect(Object.values(prismaEnum).sort()).toEqual([...domainValues].sort());
  });
});
