'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
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
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
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
    <div className="rounded-lg border bg-background">
      <Table>
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
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
                    interactive &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
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
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="py-14">
                <div className="flex flex-col items-center gap-4 text-center">
                  <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {footer !== undefined && !showEmpty && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}
