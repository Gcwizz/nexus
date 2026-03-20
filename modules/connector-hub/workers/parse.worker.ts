import { createWorker, type Job } from '@nexus/events';
import { storage } from '@nexus/storage';
import { FileCorruptError, FileSizeLimitError } from '@nexus/contracts/errors';
import { parseFile } from '../services/parser.service';
import { deduplicateEntities, tagProvenance } from '../services/normaliser.service';

// ── Job Payload ──────────────────────────────────────────────────

interface ParseJobPayload {
  jobId: string;
  orgId: string;
  sourceId: string;
  filename: string;
  storageKey: string;
}

// ── Worker ───────────────────────────────────────────────────────

const PARSE_QUEUE = 'connector-hub:parse';

export function startParseWorker() {
  const worker = createWorker<ParseJobPayload>(
    PARSE_QUEUE,
    async (job: Job<ParseJobPayload>) => {
      const { jobId, orgId, sourceId, filename, storageKey } = job.data;

      console.info(
        `[parse.worker] Starting parse job=${jobId} file=${filename} org=${orgId}`,
      );

      try {
        // Fetch file from S3
        const fileData = await storage.get(orgId, 'uploads', storageKey);
        if (!fileData) {
          throw new FileCorruptError(
            `File not found in storage: ${storageKey}`,
            { orgId },
          );
        }

        // Parse the file
        const entities = await parseFile(
          new Uint8Array(fileData),
          { orgId, sourceId, filename },
        );

        if (entities.length === 0) {
          console.info(`[parse.worker] No entities extracted from ${filename}`);
          await storage.putJSON(orgId, 'connector-hub', `parse-results/${jobId}.json`, {
            jobId,
            filename,
            entityCount: 0,
            completedAt: new Date().toISOString(),
          });
          return;
        }

        // Deduplicate
        const deduplicated = deduplicateEntities(entities);

        // Store parsed entities
        const entitiesKey = `entities/file-${jobId}-${Date.now()}.json`;
        await storage.putJSON(orgId, 'connector-hub', entitiesKey, deduplicated);

        // Store provenance
        const provenanceRecords = tagProvenance(deduplicated, [
          'source:file_upload',
          `filename:${filename}`,
        ]);
        const provenanceKey = `provenance/file-${jobId}-${Date.now()}.json`;
        await storage.putJSON(orgId, 'connector-hub', provenanceKey, provenanceRecords);

        // Store parse result summary
        await storage.putJSON(orgId, 'connector-hub', `parse-results/${jobId}.json`, {
          jobId,
          filename,
          entityCount: deduplicated.length,
          entitiesKey,
          provenanceKey,
          completedAt: new Date().toISOString(),
        });

        console.info(
          `[parse.worker] Parsed ${deduplicated.length} entities from ${filename}`,
        );

        // Update job progress
        await job.updateProgress({
          entityCount: deduplicated.length,
          status: 'complete',
        });
      } catch (err) {
        if (err instanceof FileCorruptError) {
          console.error(`[parse.worker] Corrupt file ${filename}: ${err.message}`);
          await storage.putJSON(orgId, 'connector-hub', `parse-results/${jobId}.json`, {
            jobId,
            filename,
            error: err.message,
            errorCode: err.code,
            completedAt: new Date().toISOString(),
          });
          throw err;
        }

        if (err instanceof FileSizeLimitError) {
          console.error(`[parse.worker] File too large ${filename}: ${err.message}`);
          await storage.putJSON(orgId, 'connector-hub', `parse-results/${jobId}.json`, {
            jobId,
            filename,
            error: err.message,
            errorCode: err.code,
            completedAt: new Date().toISOString(),
          });
          throw err;
        }

        // Unknown error — log and re-throw
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[parse.worker] Unexpected error parsing ${filename}: ${message}`);
        await storage.putJSON(orgId, 'connector-hub', `parse-results/${jobId}.json`, {
          jobId,
          filename,
          error: message,
          errorCode: 'PARSE_UNKNOWN',
          completedAt: new Date().toISOString(),
        });
        throw err;
      }
    },
    {
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60_000, // Max 5 parse jobs per minute
      },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[parse.worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[parse.worker] Job ${job.id} completed`);
  });

  return worker;
}
