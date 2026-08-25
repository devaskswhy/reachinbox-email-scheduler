import { prisma } from '../lib/prisma.js';
import { enqueueEmailJob } from './enqueue.js';

/** Rows in these states still owe a delivery attempt. */
const RECOVERABLE_STATUSES = ['PENDING', 'QUEUED', 'RESCHEDULED'] as const;

/** Rows are streamed in pages so a large backlog never lands in memory at once. */
const BATCH_SIZE = 500;

export interface ReconcileResult {
  scanned: number;
  enqueued: number;
  failed: number;
  /** PENDING rows promoted to QUEUED after a successful enqueue. */
  promoted: number;
}

/**
 * ===========================================================================
 * RESTART SAFETY - HOW THE THREE PIECES FIT TOGETHER
 * ===========================================================================
 * There is no cron, no node-cron, and no setInterval polling loop anywhere in
 * this system. Scheduling is done entirely by BullMQ delayed jobs. That leaves
 * exactly two ways a scheduled email could be lost, and each has a specific
 * countermeasure:
 *
 * 1. THE PROCESS OR CONTAINER RESTARTS AFTER THE JOB WAS QUEUED.
 *    Covered by Redis AOF persistence (docker-compose.yml starts redis with
 *    --appendonly yes on a named volume). A delayed job is ordinary Redis
 *    state, so it is replayed from the append-only file on restart and fires at
 *    its original time. Without AOF, every delayed job still waiting would
 *    evaporate when the container recycled.
 *
 * 2. THE PROCESS DIED BETWEEN THE DATABASE COMMIT AND THE REDIS ADD.
 *    Redis persistence cannot help here - the job never reached Redis at all.
 *    The EmailJob row exists in MySQL as PENDING and nothing is scheduled to
 *    act on it. That is the window this reconciler closes. It runs once at boot
 *    in both the API and the worker, re-enqueueing every row that still owes a
 *    send.
 *
 * The reason a blanket re-enqueue of every outstanding row is safe - rather
 * than a source of duplicate emails - is the jobId dedupe described in
 * enqueue.ts: the BullMQ job id IS the database row id. Rows that survived in
 * Redis are recognised as already present and quietly skipped; only genuinely
 * missing ones are added. So this is a no-op on a clean restart and a repair
 * pass on a dirty one, without needing to know which kind of restart occurred.
 *
 * Running it once at boot, before accepting work, is sufficient precisely
 * because it is not a poller: steady-state scheduling is BullMQ's job, and this
 * only exists to reconcile database truth with Redis state at startup.
 * ===========================================================================
 */
export async function reconcilePendingJobs(source: string): Promise<ReconcileResult> {
  const started = Date.now();
  const result: ReconcileResult = { scanned: 0, enqueued: 0, failed: 0, promoted: 0 };

  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.emailJob.findMany({
      where: { status: { in: [...RECOVERABLE_STATUSES] } },
      select: { id: true, scheduledFor: true, status: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });

    if (batch.length === 0) break;

    const promotable: string[] = [];

    for (const job of batch) {
      result.scanned += 1;
      try {
        await enqueueEmailJob(job);
        result.enqueued += 1;
        // Only PENDING is advanced. RESCHEDULED carries information the worker
        // needs (this row was deferred by the rate limiter), and QUEUED is
        // already correct, so neither is overwritten here.
        if (job.status === 'PENDING') promotable.push(job.id);
      } catch (error) {
        result.failed += 1;
        console.error(
          `[reconcile] failed to enqueue EmailJob ${job.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (promotable.length > 0) {
      const { count } = await prisma.emailJob.updateMany({
        where: { id: { in: promotable }, status: 'PENDING' },
        data: { status: 'QUEUED' },
      });
      result.promoted += count;
    }

    if (batch.length < BATCH_SIZE) break;
    cursor = batch[batch.length - 1]?.id;
    if (cursor === undefined) break;
  }

  console.log(
    `[reconcile:${source}] scanned=${result.scanned} enqueued=${result.enqueued} ` +
      `promoted=${result.promoted} failed=${result.failed} in ${Date.now() - started}ms`,
  );

  return result;
}
