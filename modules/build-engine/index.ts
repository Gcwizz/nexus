/**
 * Build Engine
 *
 * Orchestrates code generation and build pipelines from specifications.
 * Uses LLM-driven code synthesis to produce implementation artefacts,
 * then compiles, validates and packages them for deployment.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* CodeGenerator */ } from "./services/code-generator.js";
export { /* BuildOrchestrator */ } from "./services/build-orchestrator.js";
export { /* ArtefactValidator */ } from "./services/artefact-validator.js";
export { /* PackageManager */ } from "./services/package-manager.js";

// -- Event handlers ----------------------------------------------------------
export { /* onBuildRequested */ } from "./events/on-build-requested.js";
export { /* onBuildCompleted */ } from "./events/on-build-completed.js";

// -- API routes --------------------------------------------------------------
export { /* buildEngineRoutes */ } from "./api/routes.js";
