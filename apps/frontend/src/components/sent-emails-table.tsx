'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { ComposeButton } from '@/components/compose-button';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { describeApiError, fetchSentEmails, type EmailJobRow } from '@/lib/api';
import { formatLocalDateTime, localTimeZoneLabel } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';

const PAGE_SIZE = 20;

/** Only rows that actually carry an Ethereal preview URL are openable. */
function hasPreview(row: EmailJobRow): boolean {
  return row.providerMessageId !== null && row.providerMessageId.startsWith('http');
}

const columns: ReadonlyArray<DataTableColumn<EmailJobRow>> = [
  {
    key: 'recipient',
    header: 'Recipient',
    cell: (row) => (
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-medium">
          <span className="truncate">{row.recipientEmail}</span>
          {hasPreview(row) && (
            <ExternalLink
              aria-hidden
              className="size-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
            />
          )}
        </p>
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
    key: 'sentAt',
    header: 'Sent',
    cell: (row) => (
      // FAILED rows have no sentAt; fall back to when the attempt finished so
      // the column is never blank.
      <time dateTime={row.sentAt ?? row.updatedAt} className="tabular text-[13px]">
        {formatLocalDateTime(row.sentAt ?? row.updatedAt)}
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

export function SentEmailsTable() {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE };

  const query = useQuery({
    queryKey: queryKeys.sent(params),
    queryFn: () => fetchSentEmails(params),
    // No interval here: SENT and FAILED are terminal, so a row already on this
    // page will never change. New rows arrive on refocus or a tab switch.
  });

  const rows = query.data?.data ?? [];
  const meta = query.data?.pagination;

  return (
    <DataTable
      caption="Sent emails"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      isLoading={query.isPending}
      error={query.isError ? describeApiError(query.error) : null}
      onRetry={() => void query.refetch()}
      emptyMessage="Nothing sent yet"
      emptyHint="Once the worker drains a scheduled campaign, delivered mail shows up here."
      emptyAction={<ComposeButton />}
      isRowInteractive={hasPreview}
      onRowClick={(row) => {
        if (!hasPreview(row) || row.providerMessageId === null) return;
        // noopener/noreferrer: the preview is a third-party page and must not
        // get a handle on this window.
        window.open(row.providerMessageId, '_blank', 'noopener,noreferrer');
      }}
      footer={
        meta === undefined ? undefined : (
          <>
            <p className="text-xs text-muted-foreground">
              {meta.total} sent · {localTimeZoneLabel()} · click a row to read it
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
