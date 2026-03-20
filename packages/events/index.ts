import { Queue, Worker, type Job, type WorkerOptions, type QueueOptions } from 'bullmq';
import { env } from '@nexus/config';
import { type EventName } from '@nexus/contracts/events';

let _connection: { host: string; port: number } | null = null;

function connection() {
  if (!_connection) {
    const url = new URL(env().REDIS_URL);
    _connection = {
      host: url.hostname,
      port: parseInt(url.port || '6379'),
    };
  }
  return _connection;
}

// ── Queue Factory ────────────────────────────────────────────────

const queues = new Map<string, Queue>();

export function getQueue(name: string, options?: Partial<QueueOptions>): Queue {
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, {
      connection: connection(),
      ...options,
    }));
  }
  return queues.get(name)!;
}

// ── Publish Event ────────────────────────────────────────────────

export async function publishEvent<T>(
  eventName: EventName,
  payload: T,
  options?: { delay?: number; priority?: number }
): Promise<void> {
  const queue = getQueue(eventName);
  await queue.add(eventName, payload, {
    delay: options?.delay,
    priority: options?.priority,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

// ── Create Worker ────────────────────────────────────────────────

export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: Partial<WorkerOptions>
): Worker<T> {
  return new Worker<T>(queueName, processor, {
    connection: connection(),
    concurrency: 1,
    ...options,
  });
}

// ── Scheduled Jobs (for Living Twin continuous sync) ─────────────

export async function scheduleRecurring(
  queueName: string,
  jobName: string,
  data: unknown,
  cronExpression: string
): Promise<void> {
  const queue = getQueue(queueName);
  await queue.upsertJobScheduler(
    jobName,
    { pattern: cronExpression },
    { name: jobName, data }
  );
}

// ── Cleanup ──────────────────────────────────────────────────────

export async function closeAllQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}

export { Queue, Worker, type Job };
