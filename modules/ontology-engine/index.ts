/**
 * Ontology Engine
 *
 * Discovers and maintains the domain ontology — uses LLM-assisted analysis to
 * extract entities, relationships and taxonomies from ingested data, building
 * a rich knowledge graph that underpins all downstream modules.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* OntologyBuilder */ } from "./services/ontology-builder.js";
export { /* EntityExtractor */ } from "./services/entity-extractor.js";
export { /* RelationshipMapper */ } from "./services/relationship-mapper.js";
export { /* TaxonomyManager */ } from "./services/taxonomy-manager.js";

// -- Event handlers ----------------------------------------------------------
export { /* onDataIngested */ } from "./events/on-data-ingested.js";
export { /* onOntologyUpdated */ } from "./events/on-ontology-updated.js";

// -- API routes --------------------------------------------------------------
export { /* ontologyRoutes */ } from "./api/routes.js";
