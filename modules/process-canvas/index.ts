/**
 * Process Canvas
 *
 * Provides an interactive canvas for modelling, editing and simulating
 * business processes. Combines graph-based process representation with
 * LLM-assisted suggestions for process steps, decision points and swimlanes.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* ProcessModeller */ } from "./services/process-modeller.js";
export { /* StepSuggester */ } from "./services/step-suggester.js";
export { /* SimulationRunner */ } from "./services/simulation-runner.js";
export { /* SwimlaneManager */ } from "./services/swimlane-manager.js";

// -- Event handlers ----------------------------------------------------------
export { /* onProcessCreated */ } from "./events/on-process-created.js";
export { /* onProcessUpdated */ } from "./events/on-process-updated.js";

// -- API routes --------------------------------------------------------------
export { /* processCanvasRoutes */ } from "./api/routes.js";
