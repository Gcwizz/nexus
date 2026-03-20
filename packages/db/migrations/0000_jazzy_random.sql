CREATE TYPE "public"."build_status" AS ENUM('queued', 'building', 'testing', 'deploying', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."migration_status" AS ENUM('pending', 'mapping', 'validating', 'executing', 'complete', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('connected', 'syncing', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'running', 'complete', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"module" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builds" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"spec_bundle_id" text NOT NULL,
	"status" "build_status" DEFAULT 'queued' NOT NULL,
	"repo_url" text,
	"deployment_endpoints" jsonb,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"modules_complete" integer DEFAULT 0 NOT NULL,
	"modules_total" integer DEFAULT 0 NOT NULL,
	"token_usage" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "source_status" DEFAULT 'disconnected' NOT NULL,
	"credentials" jsonb,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migrations_table" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"build_id" text NOT NULL,
	"status" "migration_status" DEFAULT 'pending' NOT NULL,
	"records_migrated" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"records_total" integer DEFAULT 0 NOT NULL,
	"data_quality_score" real,
	"field_mappings" jsonb,
	"audit_log" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ontology_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"version" text NOT NULL,
	"entity_count" integer DEFAULT 0 NOT NULL,
	"relationship_count" integer DEFAULT 0 NOT NULL,
	"ghost_process_count" integer DEFAULT 0 NOT NULL,
	"confidence_high" integer DEFAULT 0 NOT NULL,
	"confidence_medium" integer DEFAULT 0 NOT NULL,
	"confidence_low" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"validated_by" text,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"ontology_version_id" text,
	"canvas_state" jsonb,
	"process_count" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"affected_processes" jsonb DEFAULT '[]'::jsonb,
	"impact" text NOT NULL,
	"complexity" text NOT NULL,
	"is_quick_win" boolean DEFAULT false NOT NULL,
	"estimated_savings" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spec_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"design_id" text NOT NULL,
	"module_count" integer DEFAULT 0 NOT NULL,
	"spec_data" jsonb,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"source_id" text NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"entities_extracted" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_designs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"name" text NOT NULL,
	"branch_name" text,
	"parent_design_id" text,
	"canvas_state" jsonb,
	"change_count" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_spec_bundle_id_spec_bundles_id_fk" FOREIGN KEY ("spec_bundle_id") REFERENCES "public"."spec_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_sources" ADD CONSTRAINT "connected_sources_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrations_table" ADD CONSTRAINT "migrations_table_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "migrations_table" ADD CONSTRAINT "migrations_table_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ontology_versions" ADD CONSTRAINT "ontology_versions_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_canvases" ADD CONSTRAINT "process_canvases_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_canvases" ADD CONSTRAINT "process_canvases_ontology_version_id_ontology_versions_id_fk" FOREIGN KEY ("ontology_version_id") REFERENCES "public"."ontology_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_canvas_id_process_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."process_canvases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_bundles" ADD CONSTRAINT "spec_bundles_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spec_bundles" ADD CONSTRAINT "spec_bundles_design_id_target_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."target_designs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_source_id_connected_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."connected_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_designs" ADD CONSTRAINT "target_designs_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_designs" ADD CONSTRAINT "target_designs_canvas_id_process_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."process_canvases"("id") ON DELETE no action ON UPDATE no action;