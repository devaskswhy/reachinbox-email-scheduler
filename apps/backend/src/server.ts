import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { closeEmailQueue } from './queue/emailQueue.js';
import { reconcilePendingJobs } from './queue/reconcile.js';
import { closeWorkerConnections, createEmailWorker } from './queue/worker.js';

let server: Server | undefined;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  // Reconcile BEFORE binding the port. Any row that was committed to MySQL but
  // never reached Redis - because a previous process died in that window - is
  // re-enqueued here. Running it first means the API never accepts a new
  // campaign while an unrecovered backlog is still invisible to the queue.
  // Safe on every boot: the jobId dedupe in queue/enqueue.ts makes it a no-op
  // for everything Redis already holds. See queue/reconcile.ts for the full
  // reasoning. This runs exactly once - there is no polling loop.
  await reconcilePendingJobs('api');

  if (env.RUN_WORKER_IN_API) {
    // Same reconcile-then-consume order as the standalone worker entrypoint.
    createEmailWorker();
    console.log('[api] worker running in-process (RUN_WORKER_IN_API=true)');
  }

  server = createApp().listen(env.PORT, () => {
    console.log(`[api] listening on http://localhost:${env.PORT}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[api] ${signal} received, closing server`);

  // Stop accepting connections before dropping the database pool and the Redis
  // connection, so in-flight requests can finish instead of failing mid-query.
  if (server !== undefined) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
  if (env.RUN_WORKER_IN_API) await closeWorkerConnections();
  await closeEmailQueue();
  await prisma.$disconnect();

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap().catch((error: unknown) => {
  // A failed reconcile means the queue state is unknown. Refuse to start rather
  // than serve a scheduler that silently drops mail.
  console.error('[api] failed to start:', error);
  process.exit(1);
});
