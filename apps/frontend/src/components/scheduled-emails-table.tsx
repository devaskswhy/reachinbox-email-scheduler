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
    cell: (row) => <span className="font-medium">{row.recipientEmail}</span>,
  },
  {
    key: 'subject',
    header: 'Subject',
    cell: (row) => (
      <span className="line-clamp-1 max-w-[28ch] text-muted-foreground">
        {row.subject}
      </span>
    ),
  },
  {
    key: 'scheduledFor',
    header: 'Scheduled',
    cell: (row) => (
      <time dateTime={row.scheduledFor} className="tabular-nums">
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
      emptyMessage="No emails scheduled yet"
      emptyAction={<ComposeButton />}
      footer={
        meta === undefined ? undefined : (
          <>
            <p className="text-xs text-muted-foreground">
              {meta.total} scheduled · times in {localTimeZoneLabel()} · refreshes every{' '}
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
