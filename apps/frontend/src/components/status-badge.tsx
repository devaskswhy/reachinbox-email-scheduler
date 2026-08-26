import type { EmailStatus } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * A coloured dot plus a label rather than a filled pill.
 *
 * A column of saturated pills fights the row content for attention; a small dot
 * carries the same signal at a glance while the text stays readable. Green and
 * red are reserved for the two terminal outcomes, so scanning the column
 * separates "done" from "still working" without reading a word.
 */
const STATUS_STYLE: Record<EmailStatus, { dot: string; label: string }> = {
  PENDING: { dot: 'bg-muted-foreground/50', label: 'Pending' },
  QUEUED: { dot: 'bg-primary', label: 'Queued' },
  SENDING: { dot: 'bg-info animate-pulse', label: 'Sending' },
  RESCHEDULED: { dot: 'bg-warning', label: 'Rescheduled' },
  SENT: { dot: 'bg-success', label: 'Sent' },
  FAILED: { dot: 'bg-destructive', label: 'Failed' },
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  const { dot, label } = STATUS_STYLE[status];

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] font-medium">
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  );
}
