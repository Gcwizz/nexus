/**
 * Target Designer
 *
 * Enables users to design the target-state architecture — the desired future
 * state of processes, systems and data flows. Provides canvas-based editing
 * with graph-backed persistence for comparing current vs. target states.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* TargetStateBuilder */ } from "./services/target-state-builder.js";
export { /* GapAnalyser */ } from "./services/gap-analyser.js";
export { /* ComparisonEngine */ } from "./services/comparison-engine.js";
export { /* TargetValidator */ } from "./services/target-validator.js";

// -- Event handlers ----------------------------------------------------------
export { /* onTargetStateCreated */ } from "./events/on-target-state-created.js";
export { /* onGapAnalysisCompleted */ } from "./events/on-gap-analysis-completed.js";

// -- API routes --------------------------------------------------------------
export { /* targetDesignerRoutes */ } from "./api/routes.js";
