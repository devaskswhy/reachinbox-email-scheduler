import type { Worker } from 'bullmq';

import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import type { EmailJobPayload } from './queue/emailQueue.js';
import { closeEmailQueue } from './queue/emailQueue.js';
import { reconcilePendingJobs } from './queue/reconcile.js';
import { closeWorkerConnections, createEmailWorker } from './queue/worker.js';

let worker: Worker<EmailJobPayload> | undefined;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  console.log(
    `[worker] booting concurrency=${env.WORKER_CONCURRENCY} ` +
      `mode=${env.RATE_LIMIT_MODE} minDelay=${env.MIN_DELAY_MS_BETWEEN_SENDS}ms ` +
      `hourlyLimit=${
        env.RATE_LIMIT_MODE === 'global'
          ? env.MAX_EMAILS_PER_HOUR
          : env.MAX_EMAILS_PER_HOUR_PER_SENDER
      }`,
  );

  // Reconcile BEFORE the Worker starts consuming. Any row committed to MySQL
  // that never reached Redis is restored first, so the worker does not begin
  // draining a queue that is still missing jobs. Safe on every restart thanks
  // to the jobId dedupe - see queue/reconcile.ts. Runs exactly once; there is
  // no polling loop anywhere in this process.
  await reconcilePendingJobs('worker');

  worker = createEmailWorker();
  console.log(`[worker] consuming queue, pid=${process.pid}`);
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[worker] ${signal} received, draining`);

  // close() waits for in-flight jobs to finish and returns their locks, so a
  // restart does not leave jobs stalled waiting for lock expiry.
  if (worker !== undefined) {
    await worker.close();
  }
  await closeWorkerConnections();
  await closeEmailQueue();
  await prisma.$disconnect();

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap().catch((error: unknown) => {
  console.error('[worker] failed to start:', error);
  process.exit(1);
});
