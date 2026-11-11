/**
 * @titan/domain: pure business rules shared by the API, background jobs,
 * the app (read-only helpers such as availableActions), and later Alexa.
 *
 * Nothing in here may do I/O (no DB, network, or clock reads). Callers pass
 * "now" and all data in explicitly, which keeps every rule deterministic and testable.
 */
export * from "./calendar.js";
export * from "./timezone.js";
export * from "./recurrence.js";
export * from "./describe.js";
export * from "./instanceWindow.js";
export * from "./status.js";
export * from "./stateMachine.js";
export * from "./lateness.js";
export * from "./points.js";
export * from "./rewards.js";
export * from "./gamification.js";
export * from "./assignment.js";
export * from "./schedule.js";
export * from "./defaults.js";
