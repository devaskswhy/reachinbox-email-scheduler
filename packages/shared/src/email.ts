/**
 * Lifecycle of a single outbound email. Mirrors the EmailJobStatus enum in
 * apps/backend/prisma/schema.prisma - keep the two in sync.
 *
 * PENDING     - row written, not yet handed to the queue
 * QUEUED      - accepted by BullMQ, waiting for its send window
 * SENDING     - claimed by a worker, SMTP handshake in flight
 * SENT        - accepted by the upstream provider
 * FAILED      - retries exhausted
 * RESCHEDULED - pushed to a later slot, typically by the hourly rate limiter
 */
export const EMAIL_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'RESCHEDULED',
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Statuses from which no further transition is possible. */
export const TERMINAL_EMAIL_STATUSES = ['SENT', 'FAILED'] as const;

export type TerminalEmailStatus = (typeof TERMINAL_EMAIL_STATUSES)[number];

/** Payload accepted when scheduling a new campaign. */
export interface ScheduleCampaignRequest {
  subject: string;
  /** Message body. Rendering/templating is resolved at send time. */
  body: string;
  /** Recipient addresses. One EmailJob is created per address. */
  recipients: string[];
  /** ISO-8601 timestamp for the earliest send. */
  startTime: string;
  /** Minimum spacing between sends in this campaign, in milliseconds. */
  delayMs: number;
  /** Per-sender hourly ceiling. Omit to inherit the global limit. */
  hourlyLimit?: number;
}

/** A queued or in-flight email, as returned by the API. Mirrors EmailJob. */
export interface ScheduledEmailDTO {
  id: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  /** ISO-8601. Earliest moment this email may be sent. */
  scheduledFor: string;
  status: EmailStatus;
  attempts: number;
  /** Failure reason from the most recent attempt, if any. */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An email that reached a terminal delivery outcome. */
export interface SentEmailDTO {
  id: string;
  campaignId: string;
  senderId: string;
  /** Sending identity's address, denormalised for display. */
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  /** Ethereal preview URL, or the provider's message id in production. */
  providerMessageId: string | null;
  /** ISO-8601 timestamp of the delivery attempt. */
  sentAt: string;
  status: TerminalEmailStatus;
}
