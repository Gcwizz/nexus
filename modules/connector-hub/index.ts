/**
 * Connector Hub
 *
 * Manages external data source connections — ingests data from third-party
 * systems (APIs, databases, file stores) and normalises it into the Nexus
 * internal format for downstream processing by the ontology and process engines.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export { /* ConnectorRegistry */ } from "./services/connector-registry.js";
export { /* IngestionPipeline */ } from "./services/ingestion-pipeline.js";
export { /* ConnectionManager */ } from "./services/connection-manager.js";

// -- Event handlers ----------------------------------------------------------
export { /* onConnectionCreated */ } from "./events/on-connection-created.js";
export { /* onIngestionCompleted */ } from "./events/on-ingestion-completed.js";

// -- API routes --------------------------------------------------------------
export { /* connectorRoutes */ } from "./api/routes.js";
