import { createWorker, type Job } from '@nexus/events';
import { graph } from '@nexus/graph';
import type { ProcessMap } from '@nexus/contracts/processes';
import type { AnalyseJobData } from '../types.js';
import { analyseLeanWastes } from '../services/lean.service.js';
import { analyseBottlenecks } from '../services/bottleneck.service.js';
import { analyseAutomationReadiness } from '../services/automation.service.js';
import {
  generateAndStoreRecommendations,
  generateCanvasAnnotations,
} from '../services/recommendation.service.js';
import { publishOptimisationComplete } from '../events/producers.js';
import { InsufficientProcessDataError } from '../errors.js';

// ── Queue Name ──────────────────────────────────────────────────

export const ANALYSE_QUEUE = 'optimisation:analyse';

// ── Worker ──────────────────────────────────────────────────────

export function startAnalyseWorker() {
  const worker = createWorker<AnalyseJobData>(
    ANALYSE_QUEUE,
    async (job: Job<AnalyseJobData>) => {
      const { orgId, canvasId } = job.data;

      job.log(`Starting optimisation analysis for org ${orgId}, canvas ${canvasId}`);

      // 1. Fetch all processes from the graph
      const rawProcesses = await graph.processes.read(orgId);
      const processes = rawProcesses as ProcessMap[];

      if (processes.length === 0) {
        throw new InsufficientProcessDataError(
          `No processes found for org ${orgId}. Cannot run optimisation analysis.`,
          { orgId },
        );
      }

      job.log(`Found ${processes.length} processes to analyse`);

      // 2. Run LEAN waste analysis
      job.updateProgress(10);
      job.log('Running LEAN waste analysis...');
      const leanResult = await analyseLeanWastes(orgId, processes);
      job.log(`LEAN analysis complete: ${leanResult.totalWasteCount} wastes found`);

      // 3. Run bottleneck detection
      job.updateProgress(35);
      job.log('Running bottleneck detection...');
      const bottleneckResult = await analyseBottlenecks(orgId, processes);
      job.log(
        `Bottleneck analysis complete: ${bottleneckResult.bottleneckCount} bottlenecks, ` +
        `${bottleneckResult.crossDeptFrictionCount} cross-dept friction points, ` +
        `${bottleneckResult.redundancyCount} redundancies`,
      );

      // 4. Run automation readiness scoring
      job.updateProgress(60);
      job.log('Running automation readiness analysis...');
      const automationResult = await analyseAutomationReadiness(orgId, processes);
      job.log(
        `Automation analysis complete: ${automationResult.immediatelyAutomatableCount} immediately automatable, ` +
        `${automationResult.needsRestructuringCount} need restructuring`,
      );

      // 5. Generate, prioritise and store recommendations
      job.updateProgress(80);
      job.log('Generating and storing recommendations...');
      const recs = await generateAndStoreRecommendations(
        orgId,
        canvasId,
        leanResult,
        bottleneckResult,
        automationResult,
      );
      job.log(`${recs.length} recommendations generated and stored`);

      // 6. Generate canvas annotations
      const annotations = generateCanvasAnnotations(recs, processes);
      job.log(`${annotations.length} canvas annotations generated`);

      // 7. Emit OptimisationComplete event
      job.updateProgress(95);
      const quickWinCount = recs.filter((r) => r.isQuickWin).length;
      await publishOptimisationComplete({
        orgId,
        recommendationCount: recs.length,
        quickWinCount,
        estimatedImpact: {
          hoursPerWeek: recs.reduce(
            (sum, r) => sum + (r.estimatedSavings.hoursPerWeek ?? 0),
            0,
          ) || undefined,
          costPerYear: recs.reduce(
            (sum, r) => sum + (r.estimatedSavings.costPerYear ?? 0),
            0,
          ) || undefined,
        },
        timestamp: new Date().toISOString(),
      });

      job.updateProgress(100);
      job.log('Optimisation analysis complete');

      return {
        recommendationCount: recs.length,
        quickWinCount,
        annotationCount: annotations.length,
        lean: {
          wasteCount: leanResult.totalWasteCount,
          processesAnalysed: leanResult.analysedProcessCount,
        },
        bottleneck: {
          bottleneckCount: bottleneckResult.bottleneckCount,
          crossDeptFrictionCount: bottleneckResult.crossDeptFrictionCount,
          redundancyCount: bottleneckResult.redundancyCount,
        },
        automation: {
          immediatelyAutomatable: automationResult.immediatelyAutomatableCount,
          needsRestructuring: automationResult.needsRestructuringCount,
          notSuitable: automationResult.notSuitableCount,
          averageScore: automationResult.averageReadinessScore,
        },
      };
    },
    {
      concurrency: 1, // Single concurrency per org — heavy LLM usage
    },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[optimisation-engine] Analysis job ${job?.id} failed for org ${job?.data.orgId}:`,
      err.message,
    );
  });

  worker.on('completed', (job) => {
    console.log(
      `[optimisation-engine] Analysis job ${job.id} completed for org ${job.data.orgId}`,
    );
  });

  return worker;
}
