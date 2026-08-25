import type { Job } from 'bullmq';

import { SEND_JOB_NAME, emailQueue, type EmailJobPayload } from './emailQueue.js';

/** Retry budget for a single delivery attempt sequence. */
const SEND_ATTEMPTS = 3;

/** First retry waits 5s, then 10s, then 20s. */
const BACKOFF_BASE_MS = 5_000;

/** The subset of an EmailJob row this module needs. */
export interface EnqueueableEmailJob {
  id: string;
  scheduledFor: Date;
}

/**
 * Enqueues one EmailJob for delivery. Safe to call any number of times for the
 * same row.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS IDEMPOTENT
 * ---------------------------------------------------------------------------
 * The BullMQ job id is set to the EmailJob's own database primary key. BullMQ
 * treats job ids as unique keys within a queue: if a job with that id already
 * exists in Redis (waiting, delayed, active or failed-awaiting-retry), `add`
 * silently returns the existing job instead of creating a second one. There is
 * no error to catch and no duplicate to clean up.
 *
 * That single property is what makes the reconciler in reconcile.ts safe to
 * run on every boot, and what makes a double-enqueue from a retried HTTP
 * request harmless.
 *
 * One subtlety worth stating: once a job completes it is eventually evicted by
 * removeOnComplete, which frees its id for reuse. That does NOT reopen a
 * duplicate-send hole, because the reconciler only ever selects rows in
 * PENDING / QUEUED / RESCHEDULED. A row that was actually delivered is SENT and
 * is never handed back to this function. The database status is the source of
 * truth for "has this been sent"; Redis is only the scheduling mechanism.
 * ---------------------------------------------------------------------------
 */
export async function enqueueEmailJob(
  emailJob: EnqueueableEmailJob,
): Promise<Job<EmailJobPayload>> {
  // A row whose send time has already passed (a backlog recovered at boot, or
  // a campaign scheduled for "now") must fire immediately rather than be given
  // a negative delay, which BullMQ would reject.
  const delay = Math.max(0, emailJob.scheduledFor.getTime() - Date.now());

  return emailQueue.add(
    SEND_JOB_NAME,
    { emailJobId: emailJob.id },
    {
      jobId: emailJob.id,
      delay,
      attempts: SEND_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_BASE_MS },
    },
  );
}
