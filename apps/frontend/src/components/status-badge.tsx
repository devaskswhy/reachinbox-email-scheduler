import { Badge } from '@/components/ui/badge';
import type { EmailStatus } from '@/lib/api';

/**
 * One tone per status, chosen so the two terminal outcomes are the only ones
 * that read as green/red - in-flight states stay cooler so a glance down the
 * column separates "done" from "still working".
 */
const STATUS_TONE = {
  PENDING: 'neutral',
  QUEUED: 'accent',
  SENDING: 'info',
  RESCHEDULED: 'warning',
  SENT: 'success',
  FAILED: 'danger',
} as const satisfies Record<EmailStatus, string>;

const STATUS_LABEL: Record<EmailStatus, string> = {
  PENDING: 'Pending',
  QUEUED: 'Queued',
  SENDING: 'Sending',
  RESCHEDULED: 'Rescheduled',
  SENT: 'Sent',
  FAILED: 'Failed',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
