'use client';

import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * MOTION BUDGET
 *
 * Each row is offset by STAGGER_STEP_MS, but the total offset is clamped to
 * STAGGER_CAP_MS. Without the cap a 20-row page would take 20 x step before
 * the last row landed, and the table would read as slow to appear; with it,
 * rows past the cap all arrive together and the whole entrance is over inside
 * the cap plus one animation duration. The animation itself is the shared
 * `fade-up` keyframe, so it uses the one brand easing from Phase 6.
 */
const STAGGER_STEP_MS = 30;
const STAGGER_CAP_MS = 150;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Applied to both the header cell and every body cell in this column. */
  className?: string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: readonly T[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  /** Message for the inline error banner; null or undefined means no error. */
  error?: string | null;
  onRetry?: (() => void) | undefined;
  emptyMessage: string;
  /** Secondary line under the empty-state title. */
  emptyHint?: string;
  emptyAction?: ReactNode;
  onRowClick?: ((row: T) => void) | undefined;
  /** Marks a row as activatable, so it reads as clickable to a keyboard user. */
  isRowInteractive?: (row: T) => boolean;
  skeletonRows?: number;
  footer?: ReactNode;
  caption?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  isLoading = false,
  error = null,
  onRetry,
  emptyMessage,
  emptyHint,
  emptyAction,
  onRowClick,
  isRowInteractive,
  skeletonRows = 6,
  footer,
  caption,
}: DataTableProps<T>) {
  // An error replaces the table entirely rather than rendering an empty one,
  // which would otherwise read as "no data" when the truth is "unknown".
  if (error !== null && error !== undefined) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-4 rounded-xl border border-destructive/25 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Could not load emails</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        {onRetry !== undefined && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Retry
          </Button>
        )}
      </div>
    );
  }

  const showEmpty = !isLoading && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
            {columns.map((column) => (
              <TableHead key={column.key} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading &&
            Array.from({ length: skeletonRows }, (_, rowIndex) => (
              <TableRow
                key={`skeleton-${String(rowIndex)}`}
                className="hover:bg-transparent"
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={column.className}>
                    <Skeleton className="h-4 w-[70%]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!isLoading &&
            rows.map((row, index) => {
              const interactive =
                onRowClick !== undefined && (isRowInteractive?.(row) ?? true);

              return (
                <TableRow
                  key={getRowId(row)}
                  className={cn(
                    'animate-fade-up',
                    // `group` lets a cell reveal its own hover affordance, e.g.
                    // the external-link glyph on an openable sent row.
                    interactive &&
                      'group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  )}
                  style={{
                    animationDelay: `${String(
                      Math.min(index * STAGGER_STEP_MS, STAGGER_CAP_MS),
                    )}ms`,
                  }}
                  {...(interactive
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: () => onRowClick(row),
                        onKeyDown: (event: React.KeyboardEvent) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick(row);
                          }
                        },
                      }
                    : {})}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}

          {showEmpty && (
            <TableRow className="border-b bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={columns.length} className="py-20">
                <div className="mx-auto flex max-w-xs animate-fade-up flex-col items-center gap-5 text-center">
                  <div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                    <Inbox aria-hidden className="size-6" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-semibold tracking-tight">{emptyMessage}</p>
                    {emptyHint !== undefined && (
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {emptyHint}
                      </p>
                    )}
                  </div>
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {footer !== undefined && !showEmpty && (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
