/**
 * Optimisation Engine
 *
 * Analyses process models and ontology graphs to identify inefficiencies,
 * redundancies and improvement opportunities. Uses LLM reasoning to propose
 * concrete optimisation recommendations with projected impact metrics.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* OptimisationAnalyser */ } from "./services/optimisation-analyser.js";
export { /* RecommendationGenerator */ } from "./services/recommendation-generator.js";
export { /* ImpactEstimator */ } from "./services/impact-estimator.js";
export { /* BottleneckDetector */ } from "./services/bottleneck-detector.js";

// -- Event handlers ----------------------------------------------------------
export { /* onAnalysisRequested */ } from "./events/on-analysis-requested.js";
export { /* onRecommendationGenerated */ } from "./events/on-recommendation-generated.js";

// -- API routes --------------------------------------------------------------
export { /* optimisationRoutes */ } from "./api/routes.js";
