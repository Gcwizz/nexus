/**
 * Connector Hub
 *
 * Manages external data source connections — ingests data from third-party
 * systems (APIs, databases, file stores) and normalises it into the Nexus
 * internal format for downstream processing by the ontology and process engines.
 */

export type * from "./types.js";

// -- Services ----------------------------------------------------------------
export {
  getProvider,
  listProviders,
  PipedriveProvider,
  type ConnectorProvider,
  type AuthType,
  type FetchEntitiesOptions,
  type FetchEntitiesResult,
  type OAuthTokens,
  type ConnectorProviderConfig,
} from "./services/connector.service.js";

// -- Event handlers ----------------------------------------------------------
export { /* onConnectionCreated */ } from "./events/on-connection-created.js";
export { /* onIngestionCompleted */ } from "./events/on-ingestion-completed.js";

// -- API routes --------------------------------------------------------------
export { /* connectorRoutes */ } from "./api/routes.js";
