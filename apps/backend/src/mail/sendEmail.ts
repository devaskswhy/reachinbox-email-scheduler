import type { EmailJob } from '@prisma/client';
import nodemailer from 'nodemailer';

import { env } from '../config/env.js';
import { getTransporter, type SmtpSender } from './transporter.js';

export interface SendResult {
  /** Ethereal preview URL when available, otherwise the provider message id. */
  providerMessageId: string | null;
}

/** Raised by the fault injector so it is distinguishable from a real SMTP error. */
export class SimulatedSmtpError extends Error {
  constructor(rate: number) {
    super(`Simulated SMTP failure (SIMULATE_SMTP_FAILURE_RATE=${rate})`);
    this.name = 'SimulatedSmtpError';
  }
}

/**
 * Fault injection for exercising the retry/backoff path and the terminal
 * FAILED state on demand. Throws BEFORE any network call, so a simulated
 * failure never sends a real message that then gets retried and sent twice.
 * Disabled entirely at the default rate of 0.
 */
function maybeSimulateFailure(): void {
  const rate = env.SIMULATE_SMTP_FAILURE_RATE;
  if (rate > 0 && Math.random() < rate) {
    throw new SimulatedSmtpError(rate);
  }
}

/**
 * Delivers one email through the sender's own SMTP credentials.
 *
 * Errors are deliberately NOT caught here. A thrown SMTP error propagates to
 * the worker processor, which records lastError and rethrows so BullMQ applies
 * the attempts/backoff policy set at enqueue time; the row is marked FAILED
 * only once the attempt budget is exhausted.
 */
export async function sendEmail(
  emailJob: Pick<EmailJob, 'recipientEmail' | 'subject' | 'body'>,
  sender: SmtpSender,
): Promise<SendResult> {
  maybeSimulateFailure();

  const transporter = getTransporter(sender);

  const info = await transporter.sendMail({
    from: sender.email,
    to: emailJob.recipientEmail,
    subject: emailJob.subject,
    html: emailJob.body,
  });

  // getTestMessageUrl returns false for non-Ethereal transports, so fall back
  // to the provider's own message id rather than storing "false".
  const previewUrl = nodemailer.getTestMessageUrl(info);
  const providerMessageId =
    typeof previewUrl === 'string' && previewUrl.length > 0
      ? previewUrl
      : (info.messageId ?? null);

  console.log(
    `[send] ${sender.email} -> ${emailJob.recipientEmail} ` +
      `("${emailJob.subject}") ${providerMessageId ?? '(no id)'}`,
  );

  return { providerMessageId };
}
