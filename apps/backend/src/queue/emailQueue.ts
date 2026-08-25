import { Queue } from 'bullmq';

import { createRedisConnection } from './connection.js';

export const EMAIL_QUEUE_NAME = 'email-send';

/** Job name within the queue. The queue carries exactly one kind of work. */
export const SEND_JOB_NAME = 'send';

/**
 * Deliberately minimal: the payload carries only the database id, never the
 * recipient, subject or body. The worker re-reads the row at send time, so a
 * job that sat in Redis for hours cannot deliver a stale copy of an email that
 * was edited or cancelled in the meantime. It also keeps Redis memory flat
 * regardless of body size.
 */
export interface EmailJobPayload {
  emailJobId: string;
}

export const emailQueueConnection = createRedisConnection();

export const emailQueue: Queue<EmailJobPayload> = new Queue<EmailJobPayload>(
  EMAIL_QUEUE_NAME,
  {
    connection: emailQueueConnection,
    defaultJobOptions: {
      // Keep a bounded window of finished jobs for debugging without letting
      // Redis grow without limit. Failures are kept deeper than successes
      // because they are what anyone actually goes looking for.
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  },
);

export async function closeEmailQueue(): Promise<void> {
  await emailQueue.close();
  emailQueueConnection.disconnect();
}
