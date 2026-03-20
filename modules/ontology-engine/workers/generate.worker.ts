import { createWorker, type Job } from '@nexus/events';
import { graph } from '@nexus/graph';
import { db, ontologyVersions } from '@nexus/db';
import { eq, and, desc } from 'drizzle-orm';
import {
  LLMParseError,
  LLMRefusalError,
  LLMTimeoutError,
  ContextOverflowError,
  HallucinationError,
  InsufficientDataError,
  OntologyError,
} from '@nexus/contracts/errors';
import { runExtractionPipeline } from '../services/extraction.service.js';
import { detectGhostProcesses } from '../services/archaeology.service.js';
import { initValidationTracking } from '../services/validation.service.js';
import { publishOntologyReady } from '../events/producers.js';
import type { GenerateJobData, PipelineStage } from '../types.js';

/**
 * BullMQ worker for the full ontology generation pipeline.
 *
 * Pipeline:
 *   1. Extract entities from normalised data (multi-stage LLM)
 *   2. Detect ghost processes (Process Archaeology)
 *   3. Write ontology to Neo4j
 *   4. Create ontology version record
 *   5. Emit OntologyReady event
 *
 * Concurrency: 1 per org (enforced by job ID pattern).
 */
export function startGenerateWorker(): void {
  createWorker<GenerateJobData>(
    'ontology:generate',
    async (job: Job<GenerateJobData>) => {
      const { orgId, triggeredBy, userId } = job.data;
      const startTime = Date.now();

      console.info(
        `[ontology-engine:generate] Starting ontology generation for org=${orgId} ` +
        `triggeredBy=${triggeredBy}`,
      );

      let stage: PipelineStage = 'extraction';

      try {
        // Stage 1-4: Run extraction pipeline
        stage = 'extraction';
        await job.updateProgress(5);

        const extractionResult = await runExtractionPipeline(
          orgId,
          (pipelineStage, progress) => {
            job.updateProgress(Math.round(progress * 0.7)); // 0-70% for extraction
            console.info(
              `[ontology-engine:generate] org=${orgId} stage=${pipelineStage} progress=${progress}%`,
            );
          },
        );

        // Stage 5: Ghost process detection (parallel-safe, runs independently)
        stage = 'archaeology';
        await job.updateProgress(70);

        let ghostProcesses;
        try {
          ghostProcesses = await detectGhostProcesses(orgId);
          console.info(
            `[ontology-engine:generate] org=${orgId} detected ${ghostProcesses.length} ghost processes`,
          );
        } catch (archError) {
          // Ghost process detection is non-critical — log and continue
          console.warn(
            `[ontology-engine:generate] Ghost process detection failed for org=${orgId}: ` +
            `${(archError as Error).message}. Continuing without ghost processes.`,
          );
          ghostProcesses = [];
        }

        // Stage 6: Write to Neo4j
        stage = 'writing';
        await job.updateProgress(85);

        // Clear existing ontology for this org before writing new one
        await graph.ontology.clear(orgId);
        await graph.ontology.write(orgId, extractionResult.nodes, extractionResult.relationships);

        console.info(
          `[ontology-engine:generate] org=${orgId} wrote ${extractionResult.nodes.length} nodes ` +
          `and ${extractionResult.relationships.length} relationships to Neo4j`,
        );

        // Stage 7: Create ontology version record
        const versionId = `ov-${orgId}-${Date.now()}`;

        // Compute confidence distribution
        let high = 0;
        let medium = 0;
        let low = 0;
        for (const node of extractionResult.nodes) {
          if (node.confidence >= 0.8) high++;
          else if (node.confidence >= 0.5) medium++;
          else low++;
        }

        await db().insert(ontologyVersions).values({
          id: versionId,
          orgId,
          version: extractionResult.version,
          entityCount: extractionResult.nodes.length,
          relationshipCount: extractionResult.relationships.length,
          ghostProcessCount: ghostProcesses.length,
          confidenceHigh: high,
          confidenceMedium: medium,
          confidenceLow: low,
          status: 'pending',
        });

        // Initialise validation tracking
        initValidationTracking(orgId, versionId);

        // Stage 8: Emit OntologyReady
        stage = 'complete';
        await job.updateProgress(95);

        await publishOntologyReady({
          orgId,
          ontologyVersion: extractionResult.version,
          entityCount: extractionResult.nodes.length,
          relationshipCount: extractionResult.relationships.length,
          ghostProcessCount: ghostProcesses.length,
          timestamp: new Date().toISOString(),
        });

        const duration = Date.now() - startTime;
        await job.updateProgress(100);

        console.info(
          `[ontology-engine:generate] Completed for org=${orgId} in ${duration}ms. ` +
          `Entities: ${extractionResult.nodes.length}, ` +
          `Relationships: ${extractionResult.relationships.length}, ` +
          `Ghost processes: ${ghostProcesses.length}`,
        );
      } catch (error) {
        const err = error as Error;
        console.error(
          `[ontology-engine:generate] Failed at stage=${stage} for org=${orgId}: ${err.message}`,
          err,
        );

        // Re-throw typed ontology errors (BullMQ will handle retry based on retryable flag)
        if (error instanceof LLMParseError) throw error;
        if (error instanceof LLMRefusalError) throw error;
        if (error instanceof LLMTimeoutError) throw error;
        if (error instanceof ContextOverflowError) throw error;
        if (error instanceof HallucinationError) throw error;
        if (error instanceof InsufficientDataError) throw error;

        throw error;
      }
    },
    {
      concurrency: 1, // Single concurrency per org for ontology generation
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  console.info('[ontology-engine:generate] Worker started');
}
