import type { EmailJob, Sender } from '@prisma/client';

export interface SendResult {
  /** Provider message id, or an Ethereal preview URL in development. */
  providerMessageId: string | null;
}

/**
 * STUB. Real Nodemailer/Ethereal delivery is wired in the next phase.
 *
 * It is kept behind this interface so the worker's claim/rate-limit/retry
 * machinery can be exercised end to end without sending anything, and so the
 * next phase only has to replace this body.
 */
export async function sendEmail(
  emailJob: EmailJob,
  sender: Pick<Sender, 'id' | 'email' | 'smtpHost' | 'smtpPort'>,
): Promise<SendResult> {
  await Promise.resolve();

  console.log(
    `[send:stub] ${sender.email} -> ${emailJob.recipientEmail} ` +
      `("${emailJob.subject}") via ${sender.smtpHost}:${sender.smtpPort}`,
  );

  return { providerMessageId: null };
}
