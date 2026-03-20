import { createWorker } from '@nexus/events';
import type { Job } from 'bullmq';

// ── Worker Definitions ──────────────────────────────────────────

const workers = [
  'sync',
  'ontology-generate',
  'ontology-archaeology',
  'canvas-generate',
  'optimise',
  'spec-generate',
  'build-orchestrate',
  'migrate',
  'video-generate',
  'drift-detect',
] as const;

// ── Register Workers ────────────────────────────────────────────

for (const name of workers) {
  createWorker(name, async (job: Job) => {
    console.log(`[worker:${name}] Processing job ${job.id}`, job.data);
  });

  console.log(`[worker:${name}] Registered`);
}

console.log(`All ${workers.length} workers registered and listening`);

// ── Graceful Shutdown ───────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('Shutting down workers...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down workers...');
  process.exit(0);
});
