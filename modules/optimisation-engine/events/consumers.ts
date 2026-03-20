import { createWorker, getQueue, type Job } from '@nexus/events';
import { EventName, type ProcessCanvasReadyPayload } from '@nexus/contracts/events';
import { ANALYSE_QUEUE } from '../workers/analyse.worker.js';
import type { AnalyseJobData } from '../types.js';

/**
 * Subscribes to ProcessCanvasReady events from Module 4.
 *
 * When a process canvas is ready (all processes mapped and validated),
 * this consumer automatically triggers the optimisation analysis pipeline.
 */
export function startProcessCanvasReadyConsumer() {
  const worker = createWorker<ProcessCanvasReadyPayload>(
    EventName.ProcessCanvasReady,
    async (job: Job<ProcessCanvasReadyPayload>) => {
      const { orgId, canvasId, timestamp } = job.data;

      console.log(
        `[optimisation-engine] Received ProcessCanvasReady for org ${orgId}, canvas ${canvasId} at ${timestamp}`,
      );

      // Queue the optimisation analysis
      const analyseQueue = getQueue(ANALYSE_QUEUE);
      await analyseQueue.add(
        'analyse',
        {
          orgId,
          canvasId,
          triggeredBy: 'process.canvas.ready',
        } satisfies AnalyseJobData,
        {
          // Deduplicate: only one analysis per org at a time
          jobId: `analyse-${orgId}-${canvasId}`,
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        },
      );

      console.log(
        `[optimisation-engine] Queued analysis job for org ${orgId}, canvas ${canvasId}`,
      );
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[optimisation-engine] ProcessCanvasReady consumer failed for job ${job?.id}:`,
      err.message,
    );
  });

  return worker;
}
