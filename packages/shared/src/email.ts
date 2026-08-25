/**
 * Lifecycle of a single scheduled email.
 *
 * PENDING    - persisted, not yet enqueued
 * SCHEDULED  - enqueued with a delay, waiting for its send window
 * PROCESSING - claimed by a worker, send in flight
 * SENT       - accepted by the upstream mail provider
 * FAILED     - exhausted all retries
 * CANCELLED  - cancelled before it was sent
 */
export const EMAIL_STATUSES = [
  'PENDING',
  'SCHEDULED',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED',
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Statuses from which no further transition is possible. */
export const TERMINAL_EMAIL_STATUSES = ['SENT', 'FAILED', 'CANCELLED'] as const;

export type TerminalEmailStatus = (typeof TERMINAL_EMAIL_STATUSES)[number];

/** Payload accepted when scheduling a new campaign. */
export interface ScheduleCampaignRequest {
  /** Human-readable campaign name shown in the dashboard. */
  name: string;
  /** Recipient email addresses. One scheduled email is created per address. */
  recipients: string[];
  subject: string;
  /** Message body. Rendering/templating is resolved at send time. */
  body: string;
  /** ISO-8601 timestamp for the earliest send. Omit to start immediately. */
  scheduledAt?: string;
}

/** A single queued or in-flight email, as returned by the API. */
export interface ScheduledEmailDTO {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  /** ISO-8601. Earliest moment this email may be sent. */
  scheduledAt: string;
  /** Sender assigned by the pool, or null while still unassigned. */
  senderId: string | null;
  attempts: number;
  /** Failure reason from the most recent attempt, if any. */
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** An email that reached a terminal delivery outcome. */
export interface SentEmailDTO {
  id: string;
  scheduledEmailId: string;
  campaignId: string;
  recipient: string;
  subject: string;
  senderId: string;
  senderEmail: string;
  /** Upstream provider message id, when the provider returns one. */
  providerMessageId: string | null;
  /** ISO-8601 timestamp of the delivery attempt. */
  sentAt: string;
  status: Extract<EmailStatus, 'SENT' | 'FAILED'>;
}
