/**
 * @chores/domain — pure business rules shared by the API, jobs, and (read-only) the app.
 *
 * Step 1 of the roadmap fills this package with:
 *   - recurrence expansion (daily/weekly/monthly/quarterly/annual)
 *   - the chore instance state machine
 *   - capacity-based auto-assignment
 *
 * Nothing in here may do I/O (no DB, network, clock reads): callers pass in
 * "now" and data explicitly, which keeps every rule deterministic and testable.
 */
export * from "./status.js";
