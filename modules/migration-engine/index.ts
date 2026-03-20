/**
 * Migration Engine
 *
 * Plans and executes data and schema migrations between current and target
 * states. Manages migration scripts, rollback strategies and progress
 * tracking across databases, graph stores and file storage.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* MigrationPlanner */ } from "./services/migration-planner.js";
export { /* MigrationExecutor */ } from "./services/migration-executor.js";
export { /* RollbackManager */ } from "./services/rollback-manager.js";
export { /* ProgressTracker */ } from "./services/progress-tracker.js";

// -- Event handlers ----------------------------------------------------------
export { /* onMigrationStarted */ } from "./events/on-migration-started.js";
export { /* onMigrationCompleted */ } from "./events/on-migration-completed.js";

// -- API routes --------------------------------------------------------------
export { /* migrationRoutes */ } from "./api/routes.js";
