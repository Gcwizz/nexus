/**
 * Spec Generator
 *
 * Generates detailed technical and functional specifications from the target
 * state design and optimisation recommendations. Uses LLM reasoning to
 * produce structured spec documents covering requirements, acceptance
 * criteria and implementation guidance.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* SpecBuilder */ } from "./services/spec-builder.js";
export { /* RequirementsExtractor */ } from "./services/requirements-extractor.js";
export { /* AcceptanceCriteriaGenerator */ } from "./services/acceptance-criteria-generator.js";
export { /* SpecFormatter */ } from "./services/spec-formatter.js";

// -- Event handlers ----------------------------------------------------------
export { /* onSpecRequested */ } from "./events/on-spec-requested.js";
export { /* onSpecGenerated */ } from "./events/on-spec-generated.js";

// -- API routes --------------------------------------------------------------
export { /* specGeneratorRoutes */ } from "./api/routes.js";
