import type { Campaign, Prisma } from '@prisma/client';

import { ApiError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { enqueueEmailJob } from '../queue/enqueue.js';
import type { PaginationInput } from '../validation/pagination.schema.js';
import { buildPaginationMeta } from '../validation/pagination.schema.js';
import type { ScheduleCampaignInput } from '../validation/campaign.schema.js';

/** Statuses representing work that has not yet reached a delivery outcome. */
const IN_FLIGHT_STATUSES = ['PENDING', 'QUEUED', 'SENDING', 'RESCHEDULED'] as const;

/** Statuses representing a finished attempt, successful or not. */
const COMPLETED_STATUSES = ['SENT', 'FAILED'] as const;

/**
 * Fanning thousands of rows out inside one interactive transaction can exceed
 * Prisma's 5s default before MySQL is anywhere near struggling.
 */
const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 30_000 } as const;

/** How many enqueues are in flight at once during the post-commit fan-out. */
const ENQUEUE_CONCURRENCY = 25;

export interface ScheduleCampaignResult {
  campaign: Campaign;
  jobCount: number;
  /** Recipients dropped because the same address appeared more than once. */
  duplicatesRemoved: number;
  /** Rows successfully handed to BullMQ and advanced to QUEUED. */
  queuedCount: number;
  /** Rows left PENDING because the enqueue failed; the reconciler recovers them. */
  pendingCount: number;
}

/** Case-insensitive de-duplication, preserving the caller's ordering. */
function dedupeRecipients(recipients: readonly string[]): string[] {
  return [...new Set(recipients)];
}

export async function scheduleCampaign(
  input: ScheduleCampaignInput,
  createdBy: string,
): Promise<ScheduleCampaignResult> {
  const recipients = dedupeRecipients(input.recipients);
  const duplicatesRemoved = input.recipients.length - recipients.length;
  const startMs = new Date(input.startTime).getTime();

  const result = await prisma.$transaction(async (tx) => {
    // Read the pool inside the transaction so a concurrent seed cannot change
    // the rotation midway through assigning this campaign's jobs.
    const senders = await tx.sender.findMany({
      orderBy: { poolIndex: 'asc' },
      select: { id: true },
    });

    if (senders.length === 0) {
      throw ApiError.unavailable(
        'No senders are configured. Seed the sender pool before scheduling.',
        { hint: 'pnpm --filter @reachinbox/backend db:seed' },
      );
    }

    const campaign = await tx.campaign.create({
      data: {
        subject: input.subject,
        body: input.body,
        startTime: new Date(input.startTime),
        delayMs: input.delayMs,
        hourlyLimit: input.hourlyLimit ?? null,
        createdBy,
      },
    });

    const jobs: Prisma.EmailJobCreateManyInput[] = recipients.map(
      (recipientEmail, index) => {
        // Round-robin: consecutive recipients land on different senders, so
        // per-sender hourly limits bind later than they would on one identity.
        const sender = senders[index % senders.length];
        if (sender === undefined) {
          throw new Error('Sender rotation produced an undefined slot');
        }

        return {
          campaignId: campaign.id,
          senderId: sender.id,
          recipientEmail,
          subject: input.subject,
          body: input.body,
          // Stagger by the configured delay so the campaign drips out rather
          // than firing every recipient at startTime.
          scheduledFor: new Date(startMs + index * input.delayMs),
          status: 'PENDING' as const,
        };
      },
    );

    const { count } = await tx.emailJob.createMany({ data: jobs });

    return { campaign, jobCount: count };
  }, TRANSACTION_OPTIONS);

  // Enqueue only AFTER the transaction commits. Adding to Redis from inside the
  // transaction would risk a job becoming visible to the worker before the row
  // it points at is committed - the worker would read a row that does not exist
  // yet. Committing first means the worst case is a row with no job, which the
  // reconciler repairs on the next boot.
  const { queuedCount, pendingCount } = await enqueueCampaignJobs(result.campaign.id);

  return { ...result, duplicatesRemoved, queuedCount, pendingCount };
}

/**
 * Hands every freshly created row to BullMQ, then advances the ones that made
 * it to QUEUED.
 *
 * A failure here is deliberately not fatal to the request: the campaign is
 * already durably committed, and any row left PENDING is picked up by
 * reconcilePendingJobs() at the next boot. Failing the whole request would be
 * worse - the caller would retry and create a duplicate campaign.
 */
async function enqueueCampaignJobs(
  campaignId: string,
): Promise<{ queuedCount: number; pendingCount: number }> {
  const jobs = await prisma.emailJob.findMany({
    where: { campaignId, status: 'PENDING' },
    select: { id: true, scheduledFor: true },
    orderBy: { scheduledFor: 'asc' },
  });

  const queuedIds: string[] = [];

  for (let offset = 0; offset < jobs.length; offset += ENQUEUE_CONCURRENCY) {
    const chunk = jobs.slice(offset, offset + ENQUEUE_CONCURRENCY);

    const settled = await Promise.allSettled(
      chunk.map(async (job) => {
        await enqueueEmailJob(job);
        return job.id;
      }),
    );

    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        queuedIds.push(outcome.value);
        return;
      }
      const failedId = chunk[index]?.id ?? 'unknown';
      console.error(
        `[schedule] enqueue failed for EmailJob ${failedId}, leaving PENDING:`,
        outcome.reason instanceof Error ? outcome.reason.message : outcome.reason,
      );
    });
  }

  let queuedCount = 0;
  if (queuedIds.length > 0) {
    const { count } = await prisma.emailJob.updateMany({
      where: { id: { in: queuedIds }, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });
    queuedCount = count;
  }

  return { queuedCount, pendingCount: jobs.length - queuedCount };
}

const JOB_LIST_SELECT = {
  id: true,
  campaignId: true,
  senderId: true,
  recipientEmail: true,
  subject: true,
  status: true,
  scheduledFor: true,
  attempts: true,
  lastError: true,
  providerMessageId: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  campaign: { select: { subject: true } },
  sender: { select: { email: true, label: true } },
} satisfies Prisma.EmailJobSelect;

type JobListRow = Prisma.EmailJobGetPayload<{ select: typeof JOB_LIST_SELECT }>;

/** Flattens the joined campaign/sender relations into display-ready fields. */
function toListItem(job: JobListRow) {
  const { campaign, sender, ...rest } = job;
  return {
    ...rest,
    campaignSubject: campaign.subject,
    senderEmail: sender.email,
    senderLabel: sender.label,
  };
}

export async function listScheduledJobs(pagination: PaginationInput) {
  const { page, limit } = pagination;
  const where = { status: { in: [...IN_FLIGHT_STATUSES] } };

  const [total, jobs] = await prisma.$transaction([
    prisma.emailJob.count({ where }),
    prisma.emailJob.findMany({
      where,
      select: JOB_LIST_SELECT,
      orderBy: [{ scheduledFor: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: jobs.map(toListItem),
    pagination: buildPaginationMeta(pagination, total),
  };
}

export async function listSentJobs(pagination: PaginationInput) {
  const { page, limit } = pagination;
  const where = { status: { in: [...COMPLETED_STATUSES] } };

  const [total, jobs] = await prisma.$transaction([
    prisma.emailJob.count({ where }),
    prisma.emailJob.findMany({
      where,
      select: JOB_LIST_SELECT,
      // FAILED rows have no sentAt; MySQL sorts NULLs last under DESC, so they
      // fall back to updatedAt ordering behind everything actually sent.
      orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: jobs.map(toListItem),
    pagination: buildPaginationMeta(pagination, total),
  };
}
