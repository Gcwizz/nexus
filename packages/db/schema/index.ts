import { pgTable, text, timestamp, jsonb, integer, real, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────────

export const sourceStatusEnum = pgEnum('source_status', ['connected', 'syncing', 'error', 'disconnected']);
export const syncStatusEnum = pgEnum('sync_status', ['pending', 'running', 'complete', 'partial', 'failed']);
export const reviewStatusEnum = pgEnum('review_status', ['pending', 'approved', 'rejected']);
export const buildStatusEnum = pgEnum('build_status', ['queued', 'building', 'testing', 'deploying', 'complete', 'failed']);
export const migrationStatusEnum = pgEnum('migration_status', ['pending', 'mapping', 'validating', 'executing', 'complete', 'failed', 'rolled_back']);

// ── Organisations ────────────────────────────────────────────────

export const organisations = pgTable('organisations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  industry: text('industry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Connected Sources (Module 1) ─────────────────────────────────

export const connectedSources = pgTable('connected_sources', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  status: sourceStatusEnum('status').default('disconnected').notNull(),
  credentials: jsonb('credentials'),
  entityCount: integer('entity_count').default(0).notNull(),
  lastSyncAt: timestamp('last_sync_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Sync Jobs (Module 1) ─────────────────────────────────────────

export const syncJobs = pgTable('sync_jobs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  sourceId: text('source_id').notNull().references(() => connectedSources.id),
  status: syncStatusEnum('status').default('pending').notNull(),
  entitiesExtracted: integer('entities_extracted').default(0).notNull(),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Ontology Versions (Module 2) ─────────────────────────────────

export const ontologyVersions = pgTable('ontology_versions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  version: text('version').notNull(),
  entityCount: integer('entity_count').default(0).notNull(),
  relationshipCount: integer('relationship_count').default(0).notNull(),
  ghostProcessCount: integer('ghost_process_count').default(0).notNull(),
  confidenceHigh: integer('confidence_high').default(0).notNull(),
  confidenceMedium: integer('confidence_medium').default(0).notNull(),
  confidenceLow: integer('confidence_low').default(0).notNull(),
  status: reviewStatusEnum('status').default('pending').notNull(),
  validatedBy: text('validated_by'),
  validatedAt: timestamp('validated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Process Canvases (Module 4) ──────────────────────────────────

export const processCanvases = pgTable('process_canvases', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  ontologyVersionId: text('ontology_version_id').references(() => ontologyVersions.id),
  canvasState: jsonb('canvas_state'),
  processCount: integer('process_count').default(0).notNull(),
  status: reviewStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Recommendations (Module 5) ───────────────────────────────────

export const recommendations = pgTable('recommendations', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  canvasId: text('canvas_id').notNull().references(() => processCanvases.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  affectedProcesses: jsonb('affected_processes').$type<string[]>().default([]),
  impact: text('impact').notNull(),
  complexity: text('complexity').notNull(),
  isQuickWin: boolean('is_quick_win').default(false).notNull(),
  estimatedSavings: jsonb('estimated_savings'),
  status: text('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Target State Designs (Module 6) ──────────────────────────────

export const targetDesigns = pgTable('target_designs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  canvasId: text('canvas_id').notNull().references(() => processCanvases.id),
  name: text('name').notNull(),
  branchName: text('branch_name'),
  parentDesignId: text('parent_design_id'),
  canvasState: jsonb('canvas_state'),
  changeCount: integer('change_count').default(0).notNull(),
  status: reviewStatusEnum('status').default('pending').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Specification Bundles (Module 7) ─────────────────────────────

export const specBundles = pgTable('spec_bundles', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  designId: text('design_id').notNull().references(() => targetDesigns.id),
  moduleCount: integer('module_count').default(0).notNull(),
  specData: jsonb('spec_data'),
  status: reviewStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Builds (Module 8) ────────────────────────────────────────────

export const builds = pgTable('builds', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  specBundleId: text('spec_bundle_id').notNull().references(() => specBundles.id),
  status: buildStatusEnum('status').default('queued').notNull(),
  repoUrl: text('repo_url'),
  deploymentEndpoints: jsonb('deployment_endpoints'),
  agentCount: integer('agent_count').default(0).notNull(),
  modulesComplete: integer('modules_complete').default(0).notNull(),
  modulesTotal: integer('modules_total').default(0).notNull(),
  tokenUsage: integer('token_usage').default(0).notNull(),
  error: text('error'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Migrations (Module 9) ────────────────────────────────────────

export const migrations = pgTable('migrations_table', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => organisations.id),
  buildId: text('build_id').notNull().references(() => builds.id),
  status: migrationStatusEnum('status').default('pending').notNull(),
  recordsMigrated: integer('records_migrated').default(0).notNull(),
  recordsFailed: integer('records_failed').default(0).notNull(),
  recordsTotal: integer('records_total').default(0).notNull(),
  dataQualityScore: real('data_quality_score'),
  fieldMappings: jsonb('field_mappings'),
  auditLog: jsonb('audit_log'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Audit Log ────────────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  userId: text('user_id'),
  module: text('module').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId: text('resource_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Relations ────────────────────────────────────────────────────

export const organisationRelations = relations(organisations, ({ many }) => ({
  connectedSources: many(connectedSources),
  syncJobs: many(syncJobs),
  ontologyVersions: many(ontologyVersions),
  processCanvases: many(processCanvases),
  recommendations: many(recommendations),
  targetDesigns: many(targetDesigns),
  specBundles: many(specBundles),
  builds: many(builds),
  migrations: many(migrations),
}));

export const connectedSourceRelations = relations(connectedSources, ({ one, many }) => ({
  organisation: one(organisations, { fields: [connectedSources.orgId], references: [organisations.id] }),
  syncJobs: many(syncJobs),
}));

export const syncJobRelations = relations(syncJobs, ({ one }) => ({
  organisation: one(organisations, { fields: [syncJobs.orgId], references: [organisations.id] }),
  source: one(connectedSources, { fields: [syncJobs.sourceId], references: [connectedSources.id] }),
}));
