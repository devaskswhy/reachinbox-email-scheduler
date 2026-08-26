/**
 * Load simulation - evidence for the "behaviour under load" requirement.
 *
 * Schedules N recipients through the real Phase 2 service (so the same
 * transaction, round-robin assignment and post-commit enqueue run) and then
 * calls the Phase 3 reconciler. Nothing is sent: the worker is not started, so
 * no SMTP connection is ever opened and no Ethereal quota is consumed.
 *
 * Run with:
 *   pnpm --filter @reachinbox/backend simulate:load
 *   pnpm --filter @reachinbox/backend simulate:load -- --recipients 5000
 */
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { closeEmailQueue, emailQueue } from '../src/queue/emailQueue.js';
import { hourBucket, hourlyLimitFor } from '../src/queue/rateLimiter.js';
import { reconcilePendingJobs } from '../src/queue/reconcile.js';
import { scheduleCampaign } from '../src/services/campaign.service.js';

const DEFAULT_RECIPIENTS = 1000;
/** Far enough ahead that nothing becomes due while the script is measuring. */
const START_OFFSET_MINUTES = 30;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseRecipientCount(): number {
  const raw = argValue('--recipients');
  if (raw === undefined) return DEFAULT_RECIPIENTS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--recipients must be a positive integer, got ${raw}`);
  }
  return parsed;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function padStart(value: string | number, width: number): string {
  return String(value).padStart(width);
}

/**
 * Collects every job id currently held by the queue, across all the states a
 * scheduled-but-unsent job can be in. Used to prove nothing was dropped
 * between the database write and Redis.
 */
async function collectQueueJobIds(): Promise<Set<string>> {
  const [waiting, delayed, active, prioritised] = await Promise.all([
    emailQueue.getWaiting(0, -1),
    emailQueue.getDelayed(0, -1),
    emailQueue.getActive(0, -1),
    emailQueue.getPrioritized(0, -1),
  ]);

  const ids = new Set<string>();
  for (const job of [...waiting, ...delayed, ...active, ...prioritised]) {
    if (job.id !== undefined) ids.add(job.id);
  }
  return ids;
}

interface BucketProjection {
  scope: string;
  label: string;
  total: number;
  buckets: Array<{ bucket: string; count: number }>;
}

/**
 * Projects how the hourly limiter would spread a sender's backlog across hour
 * windows.
 *
 * This is a projection, not an observation: the jobs are not processed here.
 * It applies the same rule the worker applies - fill the current hour bucket up
 * to the limit, push the remainder into the next window via moveToDelayed -
 * so it shows what the configured limit implies for this volume.
 */
function projectBuckets(
  scope: string,
  label: string,
  scheduledTimes: readonly Date[],
  limit: number,
): BucketProjection {
  const ordered = [...scheduledTimes].sort((a, b) => a.getTime() - b.getTime());
  const buckets: Array<{ bucket: string; count: number }> = [];

  let cursor = ordered[0] ?? new Date();
  let remaining = ordered.length;

  while (remaining > 0) {
    const count = Math.min(limit, remaining);
    buckets.push({ bucket: hourBucket(cursor), count });
    remaining -= count;

    // Next window starts at the top of the following hour.
    const next = new Date(cursor);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    cursor = next;
  }

  return { scope, label, total: ordered.length, buckets };
}

async function main(): Promise<void> {
  const recipientCount = parseRecipientCount();
  const startTime = new Date(Date.now() + START_OFFSET_MINUTES * 60_000);

  const senders = await prisma.sender.findMany({
    orderBy: { poolIndex: 'asc' },
    select: { id: true, poolIndex: true, email: true },
  });

  if (senders.length === 0) {
    throw new Error(
      'No senders configured. Run: pnpm --filter @reachinbox/backend db:seed',
    );
  }

  const limit = hourlyLimitFor(null);

  console.log('ReachInbox Scheduler - load simulation');
  console.log(`  recipients        : ${recipientCount}`);
  console.log(`  startTime         : ${startTime.toISOString()}`);
  console.log(`  delayMs           : 0 (all recipients target the same instant)`);
  console.log(`  senders in pool   : ${senders.length}`);
  console.log(`  rate limit mode   : ${env.RATE_LIMIT_MODE}`);
  console.log(`  hourly limit      : ${limit}`);
  console.log('  sending           : disabled (worker not started)\n');

  // Unique addresses: the service de-duplicates, so repeated addresses would
  // silently shrink the load being simulated.
  const recipients = Array.from(
    { length: recipientCount },
    (_, index) => `load-${String(index).padStart(6, '0')}@example.invalid`,
  );

  console.log('Scheduling through the Phase 2 service...');
  const scheduleStarted = Date.now();
  const result = await scheduleCampaign(
    {
      subject: `[simulate-load] ${recipientCount} recipients`,
      body: '<p>Load simulation. Never sent.</p>',
      recipients,
      startTime: startTime.toISOString(),
      delayMs: 0,
    },
    'simulate-load@local',
  );
  const scheduleMs = Date.now() - scheduleStarted;

  console.log(`  campaign id       : ${result.campaign.id}`);
  console.log(`  jobs created      : ${result.jobCount}`);
  console.log(`  queued            : ${result.queuedCount}`);
  console.log(`  left PENDING      : ${result.pendingCount}`);
  console.log(`  duplicates removed: ${result.duplicatesRemoved}`);
  console.log(`  elapsed           : ${scheduleMs}ms\n`);

  console.log('Running the Phase 3 reconciler...');
  const reconcile = await reconcilePendingJobs('simulate-load');
  console.log('');

  const rows = await prisma.emailJob.findMany({
    where: { campaignId: result.campaign.id },
    select: { id: true, senderId: true, scheduledFor: true },
  });

  const queueIds = await collectQueueJobIds();
  const foundInQueue = rows.filter((row) => queueIds.has(row.id)).length;
  const missingFromQueue = rows.length - foundInQueue;
  const dropped = recipientCount - rows.length;

  console.log('Integrity');
  console.log(`  requested         : ${recipientCount}`);
  console.log(`  rows in database  : ${rows.length}`);
  console.log(`  jobs found in Redis: ${foundInQueue}`);
  console.log(`  missing from Redis : ${missingFromQueue}`);
  console.log(`  dropped            : ${dropped}`);

  const intact = dropped === 0 && missingFromQueue === 0;
  console.log(
    intact
      ? '  RESULT             : OK - every scheduled job exists in both the database and the queue\n'
      : '  RESULT             : FAILED - jobs are missing\n',
  );

  // ---- Hour-bucket projection ------------------------------------------
  const bySender = new Map<string, Date[]>();
  for (const row of rows) {
    const list = bySender.get(row.senderId) ?? [];
    list.push(row.scheduledFor);
    bySender.set(row.senderId, list);
  }

  const projections: BucketProjection[] = [];

  if (env.RATE_LIMIT_MODE === 'global') {
    projections.push(
      projectBuckets(
        'global',
        'all senders share one bucket',
        rows.map((row) => row.scheduledFor),
        limit,
      ),
    );
  } else {
    for (const sender of senders) {
      const times = bySender.get(sender.id) ?? [];
      if (times.length === 0) continue;
      projections.push(
        projectBuckets(`sender ${sender.poolIndex}`, sender.email, times, limit),
      );
    }
  }

  console.log(`Projected hour-bucket distribution (limit ${limit} per window)`);
  console.log(
    '  This is what the limiter implies for this volume; jobs are not processed here.\n',
  );

  for (const projection of projections) {
    console.log(`  ${projection.scope} - ${projection.label}`);
    console.log(
      `    assigned: ${projection.total} jobs across ${projection.buckets.length} hour window(s)`,
    );
    for (const { bucket, count } of projection.buckets) {
      const bar = '#'.repeat(Math.max(1, Math.round((count / limit) * 40)));
      console.log(`      ${pad(bucket, 16)} ${padStart(count, 5)}  ${bar}`);
    }
    console.log('');
  }

  const spread = Math.max(...projections.map((p) => p.buckets.length));
  console.log('Summary');
  console.log(`  total scheduled    : ${rows.length}`);
  console.log(
    `  reconciler         : scanned=${reconcile.scanned} enqueued=${reconcile.enqueued} failed=${reconcile.failed}`,
  );
  console.log(`  hours to drain     : ${spread} (at ${limit}/hour per window)`);
  console.log(`  campaign id        : ${result.campaign.id}`);
  console.log('\nClean up with:');
  console.log(
    `  DELETE FROM campaigns WHERE id = '${result.campaign.id}';  (email_jobs cascade)`,
  );

  if (!intact) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('simulate-load failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEmailQueue();
    await prisma.$disconnect();
  });
