import type { Sender } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';

/** The credential fields a transporter needs, as stored on the Sender row. */
export type SmtpSender = Pick<
  Sender,
  'id' | 'email' | 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPass'
>;

/**
 * One transporter per sender, keyed by sender.id and held for the lifetime of
 * the process.
 *
 * Rebuilding on every send would open a fresh SMTP connection each time, which
 * is the expensive part of sending - the TCP handshake plus STARTTLS plus AUTH
 * costs far more than the message itself. Caching a pooled transporter lets
 * consecutive sends from the same sender reuse an authenticated connection.
 */
const transporters = new Map<string, Transporter>();

/** Port 465 is implicit TLS; 587 and 25 negotiate STARTTLS after connecting. */
const IMPLICIT_TLS_PORT = 465;

export function getTransporter(sender: SmtpSender): Transporter {
  const cached = transporters.get(sender.id);
  if (cached !== undefined) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === IMPLICIT_TLS_PORT,
    auth: {
      // Credentials come from the Sender row exactly as the Phase 1 seed wrote
      // them. Nothing here calls createTestAccount(), so a restart reuses the
      // same Ethereal inbox instead of minting a new one and orphaning the
      // messages already sent through it.
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    pool: true,
    // The queue-wide BullMQ limiter already paces sends, so a small pool is
    // enough; more sockets per sender would sit idle.
    maxConnections: 2,
    maxMessages: 100,
  });

  transporters.set(sender.id, transporter);
  return transporter;
}

/** Closes every pooled connection. Called on worker shutdown. */
export function closeTransporters(): void {
  for (const transporter of transporters.values()) {
    transporter.close();
  }
  transporters.clear();
}

/** Test seam: lets a probe assert the cache actually returns the same object. */
export function transporterCacheSize(): number {
  return transporters.size;
}
