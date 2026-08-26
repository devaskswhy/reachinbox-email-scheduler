'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { ComposeButton } from '@/components/compose-button';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { describeApiError, fetchScheduledEmails, type EmailJobRow } from '@/lib/api';
import { formatLocalDateTime, localTimeZoneLabel } from '@/lib/format';
import { SCHEDULED_REFETCH_MS, queryKeys } from '@/lib/query-keys';

const PAGE_SIZE = 20;

const columns: ReadonlyArray<DataTableColumn<EmailJobRow>> = [
  {
    key: 'recipient',
    header: 'Recipient',
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.recipientEmail}</p>
        <p className="truncate text-xs text-muted-foreground">via {row.senderEmail}</p>
      </div>
    ),
  },
  {
    key: 'subject',
    header: 'Subject',
    cell: (row) => (
      <span className="line-clamp-1 max-w-[32ch] text-muted-foreground">
        {row.subject}
      </span>
    ),
  },
  {
    key: 'scheduledFor',
    header: 'Scheduled',
    cell: (row) => (
      <time dateTime={row.scheduledFor} className="tabular text-[13px]">
        {formatLocalDateTime(row.scheduledFor)}
      </time>
    ),
    className: 'whitespace-nowrap',
  },
  {
    key: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge status={row.status} />,
    className: 'w-px whitespace-nowrap',
  },
];

export function ScheduledEmailsTable() {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE };

  const query = useQuery({
    queryKey: queryKeys.scheduled(params),
    queryFn: () => fetchScheduledEmails(params),
    // Scheduled rows change state on their own as the worker drains the queue
    // (QUEUED -> SENDING -> SENT), with no user action to hang a refresh off.
    // Polling is what keeps the table honest; see README.
    refetchInterval: SCHEDULED_REFETCH_MS,
    refetchIntervalInBackground: false,
  });

  const rows = query.data?.data ?? [];
  const meta = query.data?.pagination;

  return (
    <DataTable
      caption="Scheduled emails"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      isLoading={query.isPending}
      error={query.isError ? describeApiError(query.error) : null}
      onRetry={() => void query.refetch()}
      emptyMessage="Nothing scheduled yet"
      emptyHint="Upload a lead list and pick a send window to get your first campaign moving."
      emptyAction={<ComposeButton />}
      footer={
        meta === undefined ? undefined : (
          <>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {/* Pulses while a poll is in flight, so "live" is visible rather
                  than merely claimed. */}
              <span
                aria-hidden
                className={
                  query.isFetching
                    ? 'size-1.5 animate-pulse rounded-full bg-primary'
                    : 'size-1.5 rounded-full bg-success'
                }
              />
              {meta.total} scheduled · {localTimeZoneLabel()} · live every{' '}
              {SCHEDULED_REFETCH_MS / 1000}s
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {meta.page} / {Math.max(1, meta.totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )
      }
    />
  );
}
