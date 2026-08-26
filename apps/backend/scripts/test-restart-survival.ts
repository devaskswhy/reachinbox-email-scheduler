/**
 * Restart-survival test.
 *
 * Proves the Phase 3 guarantee end to end: jobs scheduled before a worker is
 * killed are still in Redis afterwards, are not duplicated by the reconciler
 * that runs on the next boot, and still send at their original time.
 *
 * Two phases so it works with or without an interactive terminal:
 *
 *   1. pnpm --filter @reachinbox/backend test:restart
 *        Schedules the emails and prints their state. In a TTY it then waits
 *        for you to restart the worker and press Enter; otherwise it prints
 *        the instructions and exits.
 *
 *   2. pnpm --filter @reachinbox/backend test:restart -- --verify
 *        Re-queries and asserts. Safe to run repeatedly.
 */
import { createInterface } from 'node:readline/promises';

import { prisma } from '../src/lib/prisma.js';
import { closeEmailQueue, emailQueue } from '../src/queue/emailQueue.js';
import { scheduleCampaign } from '../src/services/campaign.service.js';

/** Marks the campaign so --verify can find it without a state file. */
const SUBJECT_MARKER = '[restart-survival]';
const RECIPIENT_COUNT = 5;
/** Long enough to kill and restart a worker before anything becomes due. */
const LEAD_SECONDS = 120;
const DELAY_MS = 5_000;

interface JobSnapshot {
  id: string;
  recipientEmail: string;
  status: string;
  scheduledFor: Date;
  sentAt: Date | null;
  attempts: number;
}

async function findLatestCampaign() {
  return prisma.campaign.findFirst({
    where: { subject: { startsWith: SUBJECT_MARKER } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, subject: true, createdAt: true, startTime: true },
  });
}

async function snapshot(campaignId: string): Promise<JobSnapshot[]> {
  return prisma.emailJob.findMany({
    where: { campaignId },
    orderBy: { scheduledFor: 'asc' },
    select: {
      id: true,
      recipientEmail: true,
      status: true,
      scheduledFor: true,
      sentAt: true,
      attempts: true,
    },
  });
}

function printJobs(jobs: readonly JobSnapshot[]): void {
  console.log(
    `  ${'recipient'.padEnd(34)}${'status'.padEnd(13)}${'scheduledFor'.padEnd(26)}sentAt`,
  );
  for (const job of jobs) {
    console.log(
      `  ${job.recipientEmail.padEnd(34)}${job.status.padEnd(13)}` +
        `${job.scheduledFor.toISOString().padEnd(26)}` +
        `${job.sentAt === null ? '-' : job.sentAt.toISOString()}`,
    );
  }
}

/** Which of these rows still have a BullMQ job, and in what state. */
async function queueStateFor(jobs: readonly JobSnapshot[]) {
  const states = new Map<string, string>();
  let present = 0;

  for (const job of jobs) {
    const queued = await emailQueue.getJob(job.id);
    if (queued === undefined) continue;
    present += 1;
    states.set(job.id, await queued.getState());
  }

  return { present, states };
}

async function setup(): Promise<void> {
  const startTime = new Date(Date.now() + LEAD_SECONDS * 1000);

  console.log('Restart-survival test - phase 1: schedule\n');

  const recipients = Array.from(
    { length: RECIPIENT_COUNT },
    (_, index) => `restart-${String(index)}@example.invalid`,
  );

  const result = await scheduleCampaign(
    {
      subject: `${SUBJECT_MARKER} ${new Date().toISOString()}`,
      body: '<p>Restart survival probe.</p>',
      recipients,
      startTime: startTime.toISOString(),
      delayMs: DELAY_MS,
    },
    'restart-test@local',
  );

  const jobs = await snapshot(result.campaign.id);
  const { present, states } = await queueStateFor(jobs);

  console.log(`  campaign id : ${result.campaign.id}`);
  console.log(
    `  scheduled   : ${result.jobCount} jobs, first due ${startTime.toISOString()}`,
  );
  console.log(`  in Redis    : ${present}/${jobs.length}`);
  console.log(`  queue states: ${[...new Set(states.values())].join(', ')}\n`);
  printJobs(jobs);

  console.log('\n--------------------------------------------------------------');
  console.log('NOW RESTART THE WORKER:');
  console.log('  1. In the worker terminal, press Ctrl+C (or kill the process).');
  console.log('  2. Start it again:  pnpm --filter @reachinbox/backend worker');
  console.log('  3. Watch its boot log for the [reconcile:worker] line.');
  console.log('--------------------------------------------------------------\n');

  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await rl.question('Press Enter once the worker is running again... ');
    rl.close();
    await verify();
    return;
  }

  console.log('Not a TTY, so not waiting. After restarting the worker, run:');
  console.log('  pnpm --filter @reachinbox/backend test:restart -- --verify');
}

async function verify(): Promise<void> {
  console.log('\nRestart-survival test - phase 2: verify\n');

  const campaign = await findLatestCampaign();
  if (campaign === null) {
    throw new Error(
      'No restart-survival campaign found. Run phase 1 first (without --verify).',
    );
  }

  const jobs = await snapshot(campaign.id);
  const { present, states } = await queueStateFor(jobs);

  console.log(`  campaign id : ${campaign.id}`);
  console.log(`  created     : ${campaign.createdAt.toISOString()}`);
  console.log(`  in Redis    : ${present}/${jobs.length}\n`);
  printJobs(jobs);

  // --- Assertion 1: no duplicate rows -----------------------------------
  const byRecipient = new Map<string, number>();
  for (const job of jobs) {
    byRecipient.set(job.recipientEmail, (byRecipient.get(job.recipientEmail) ?? 0) + 1);
  }
  const duplicated = [...byRecipient.entries()].filter(([, count]) => count > 1);
  const noDuplicates = duplicated.length === 0 && jobs.length === RECIPIENT_COUNT;

  // --- Assertion 2: unsent jobs are still in BullMQ ----------------------
  // A job that already completed is legitimately gone from the queue, so only
  // rows still owing a send are required to be present.
  const outstanding = jobs.filter(
    (job) => job.status !== 'SENT' && job.status !== 'FAILED',
  );
  const outstandingPresent = outstanding.filter((job) => states.has(job.id)).length;
  const allOutstandingQueued = outstandingPresent === outstanding.length;

  // --- Assertion 3: sends happened at (not before) the scheduled time ----
  const sent = jobs.filter((job) => job.sentAt !== null);
  const earlySends = sent.filter(
    (job) => job.sentAt !== null && job.sentAt.getTime() < job.scheduledFor.getTime(),
  );
  const noEarlySends = earlySends.length === 0;

  console.log('\nAssertions');
  console.log(
    `  no duplicate rows              : ${noDuplicates ? 'PASS' : 'FAIL'} ` +
      `(${jobs.length} rows for ${RECIPIENT_COUNT} recipients)`,
  );
  console.log(
    `  outstanding jobs still queued  : ${allOutstandingQueued ? 'PASS' : 'FAIL'} ` +
      `(${outstandingPresent}/${outstanding.length} present in Redis)`,
  );
  console.log(
    `  nothing sent before its time   : ${noEarlySends ? 'PASS' : 'FAIL'} ` +
      `(${sent.length} sent so far, ${earlySends.length} early)`,
  );

  if (outstanding.length > 0) {
    console.log(
      `\n  ${outstanding.length} job(s) still pending - re-run --verify after ` +
        'their scheduled time to confirm they send.',
    );
  } else {
    console.log('\n  All jobs reached a terminal state.');
  }

  const passed = noDuplicates && allOutstandingQueued && noEarlySends;
  console.log(
    passed
      ? '\nRESULT: PASS - the restart neither duplicated nor lost any job.'
      : '\nRESULT: FAIL - see the assertions above.',
  );

  if (!passed) process.exitCode = 1;
}

const run = process.argv.includes('--verify') ? verify : setup;

run()
  .catch((error: unknown) => {
    console.error('test-restart-survival failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeEmailQueue();
    await prisma.$disconnect();
  });
