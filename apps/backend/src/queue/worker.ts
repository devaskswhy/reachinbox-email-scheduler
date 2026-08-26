import { DelayedError, Worker, type Job } from 'bullmq';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { createRedisConnection } from './connection.js';
import { EMAIL_QUEUE_NAME, type EmailJobPayload } from './emailQueue.js';
import { hourlyLimitFor, nextHourWindowStart, reserveSendSlot } from './rateLimiter.js';
import { sendEmail } from '../mail/index.js';

/** Statuses a job may legitimately be claimed from. */
const CLAIMABLE_STATUSES = ['PENDING', 'QUEUED', 'RESCHEDULED'] as const;

/**
 * Ceiling on the per-job stagger applied when a job is pushed into the next
 * hour window, so a late-position job cannot be nudged past the window it was
 * just moved into.
 */
const MAX_REQUEUE_STAGGER_MS = 5 * 60 * 1000;

/** Dedicated connection: the Worker's own is busy with blocking commands. */
const rateLimitRedis = createRedisConnection();
const workerConnection = createRedisConnection();

/**
 * Reconstructs a job's ordinal position within its campaign from its scheduled
 * time, since the row does not store an explicit index. With delayMs of 0 every
 * recipient shares a timestamp and there is no order to preserve, so it is 0.
 */
function originalPosition(
  scheduledFor: Date,
  campaignStart: Date,
  delayMs: number,
): number {
  if (delayMs <= 0) return 0;
  const offset = scheduledFor.getTime() - campaignStart.getTime();
  return Math.max(0, Math.round(offset / delayMs));
}

async function processSendJob(job: Job<EmailJobPayload>, token?: string): Promise<void> {
  const { emailJobId } = job.data;

  // ---------------------------------------------------------------------
  // ATOMIC CLAIM
  // ---------------------------------------------------------------------
  // A single conditional UPDATE is the concurrency control for the whole
  // system. Only one caller can move a row out of PENDING/QUEUED/RESCHEDULED
  // into SENDING, because MySQL serialises the row write; everyone else gets
  // count === 0 and stops.
  //
  // This is what makes concurrency > 1 safe, and it is also the guard against
  // BullMQ stalled-job recovery: if a worker is paused long enough to lose its
  // lock, BullMQ hands the job to a second worker, and without this claim both
  // would send. Here the second one finds the row already SENDING (or SENT)
  // and returns without touching SMTP.
  const claim = await prisma.emailJob.updateMany({
    where: { id: emailJobId, status: { in: [...CLAIMABLE_STATUSES] } },
    data: { status: 'SENDING' },
  });

  if (claim.count === 0) {
    console.log(`[worker] ${emailJobId} already claimed or completed, skipping`);
    return;
  }

  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: {
      sender: true,
      campaign: { select: { startTime: true, delayMs: true, hourlyLimit: true } },
    },
  });

  if (emailJob === null) {
    // The row was deleted after the claim. Nothing to send and nothing to fail.
    console.warn(`[worker] ${emailJobId} vanished after claim, dropping`);
    return;
  }

  try {
    // -------------------------------------------------------------------
    // PER-SENDER HOURLY RATE LIMIT
    // -------------------------------------------------------------------
    const limit = hourlyLimitFor(emailJob.campaign.hourlyLimit ?? null);
    const decision = await reserveSendSlot(rateLimitRedis, emailJob.senderId, limit);

    if (!decision.allowed) {
      const position = originalPosition(
        emailJob.scheduledFor,
        emailJob.campaign.startTime,
        emailJob.campaign.delayMs,
      );
      const stagger = Math.min(
        position * env.MIN_DELAY_MS_BETWEEN_SENDS,
        MAX_REQUEUE_STAGGER_MS,
      );
      const runAt = nextHourWindowStart() + stagger;

      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'RESCHEDULED',
          lastError:
            `Hourly limit reached (${decision.count - 1}/${decision.limit} in ` +
            `${decision.key}); deferred to ${new Date(runAt).toISOString()}`,
        },
      });

      // The job is deferred, never failed and never dropped: no attempt is
      // consumed and lastError is informational, not a failure record.
      //
      // ORDERING TRADE-OFF, stated plainly: the stagger only *roughly*
      // preserves the original send order. Once several workers interleave -
      // each hitting the limit at a slightly different moment, with retries
      // and backoff in the mix - jobs can be re-queued out of sequence and two
      // jobs can land on the same millisecond. Ordering here is best-effort,
      // not a guarantee. Strict ordering would need a single-consumer queue
      // per sender, which costs the throughput that concurrency buys.
      await job.moveToDelayed(runAt, token);

      // NOTE: after moveToDelayed the job is no longer active and this worker
      // no longer holds its lock. Returning normally would make BullMQ try to
      // complete it and throw a missing-lock error. Throwing DelayedError is
      // how v5 signals "already moved, leave it alone" - worker.js checks for
      // exactly this and skips both the completed and failed paths.
      throw new DelayedError();
    }

    const result = await sendEmail(emailJob, emailJob.sender);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lastError: null,
      },
    });
  } catch (error) {
    // A deferred job is not a failure; let it pass through untouched.
    if (error instanceof DelayedError) throw error;

    const message = error instanceof Error ? error.message : String(error);

    // attemptsStarted counts runs that have begun and is 1 during the first
    // pass, so this run is the last one when it reaches the configured budget.
    const budget = job.opts.attempts ?? 1;
    const started = job.attemptsStarted > 0 ? job.attemptsStarted : job.attemptsMade + 1;
    const exhausted = started >= budget;

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        attempts: { increment: 1 },
        lastError: message.slice(0, 2000),
        // Only the final attempt is terminal. Earlier ones go back to QUEUED
        // so the row still reads as outstanding work - and so the reconciler
        // would pick it up if this process died before BullMQ retried.
        status: exhausted ? 'FAILED' : 'QUEUED',
      },
    });

    console.error(
      `[worker] ${emailJobId} attempt ${started}/${budget} failed: ${message}`,
    );

    // Rethrow so BullMQ applies the attempts/backoff policy set at enqueue time.
    throw error;
  }
}

export function createEmailWorker(): Worker<EmailJobPayload> {
  const worker = new Worker<EmailJobPayload>(EMAIL_QUEUE_NAME, processSendJob, {
    connection: workerConnection,
    concurrency: env.WORKER_CONCURRENCY,
    // ---------------------------------------------------------------------
    // MINIMUM SPACING BETWEEN SENDS
    // ---------------------------------------------------------------------
    // BullMQ's limiter is a queue-wide token bucket held in Redis, not a
    // per-process sleep: max jobs may start per duration window across every
    // worker sharing this queue name. max: 1 with duration = N therefore means
    // "at most one send begins every N milliseconds, system-wide", which is
    // exactly the minimum inter-send delay.
    //
    // It is enforced in Redis rather than in this process, so it keeps holding
    // when a second worker container is started, and it throttles job *starts*,
    // leaving concurrency free to overlap the SMTP round-trips that follow.
    limiter: {
      max: 1,
      duration: env.MIN_DELAY_MS_BETWEEN_SENDS,
    },
  });

  worker.on('failed', (job, error) => {
    console.error(`[worker] job ${job?.id ?? 'unknown'} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[worker] worker error:', error.message);
  });

  return worker;
}

export async function closeWorkerConnections(): Promise<void> {
  rateLimitRedis.disconnect();
  workerConnection.disconnect();
}
