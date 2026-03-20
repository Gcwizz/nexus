/** Supported connector provider types. */
export type ConnectorProvider = "rest-api" | "graphql" | "database" | "file-store" | "webhook";

/** Configuration for a single external connection. */
export interface ConnectionConfig {
  id: string;
  provider: ConnectorProvider;
  name: string;
  endpoint: string;
  credentials: Record<string, unknown>;
  pollingIntervalMs?: number;
  enabled: boolean;
}

/** Result of an ingestion run. */
export interface IngestionResult {
  connectionId: string;
  recordsIngested: number;
  startedAt: Date;
  completedAt: Date;
  errors: IngestionError[];
}

/** An error encountered during ingestion. */
export interface IngestionError {
  code: string;
  message: string;
  recordRef?: string;
}

/** Runtime state of a connector instance. */
export interface ConnectorState {
  connectionId: string;
  status: "idle" | "syncing" | "error" | "disabled";
  lastSyncAt?: Date;
  nextSyncAt?: Date;
}
