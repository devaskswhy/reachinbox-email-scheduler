import { env } from './config/env.js';

// Queue wiring (BullMQ Worker, rate limiter, sender pool) lands in a later
// phase. This entrypoint exists so `pnpm dev` runs the API and the worker as
// two independent processes from the start.

console.log(
  `[worker] booting concurrency=${env.WORKER_CONCURRENCY} ` +
    `mode=${env.RATE_LIMIT_MODE} redis=${env.REDIS_URL}`,
);

const shutdown = (signal: string) => {
  console.log(`[worker] ${signal} received, draining`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
