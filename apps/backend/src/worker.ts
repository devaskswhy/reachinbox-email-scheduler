import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { closeEmailQueue } from './queue/emailQueue.js';
import { reconcilePendingJobs } from './queue/reconcile.js';

let shuttingDown = false;

async function bootstrap(): Promise<void> {
  console.log(
    `[worker] booting concurrency=${env.WORKER_CONCURRENCY} ` +
      `mode=${env.RATE_LIMIT_MODE} redis=${env.REDIS_URL}`,
  );

  // The worker reconciles at boot too, not just the API. Either process may be
  // the one that restarts first, and whichever comes up should repair the
  // database-committed-but-never-queued window rather than waiting for the
  // other. Both running it is harmless: the jobId dedupe means the second pass
  // finds everything already present and adds nothing. Runs exactly once - no
  // cron, no polling interval.
  await reconcilePendingJobs('worker');

  // The BullMQ Worker/processor is wired up in the next phase. Reconciliation
  // deliberately happens before it would start consuming, so no job is
  // processed while the backlog is still being restored.
  console.log('[worker] ready (processor not yet implemented)');
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[worker] ${signal} received, draining`);
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
