import { cn } from '@/lib/utils';

/** Placeholder block sized by the caller; pulses while data is in flight. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
  );
}

export { Skeleton };
