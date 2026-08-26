import { cn } from '@/lib/utils';

/**
 * App name plus a logo placeholder. Isolated so swapping in the real mark
 * later touches one file, not both the login card and the dashboard header.
 */
export function Brand({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'h-12 w-12 text-lg' : 'h-9 w-9 text-sm';
  const label = size === 'lg' ? 'text-xl' : 'text-base';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        aria-hidden
        className={cn(
          'grid shrink-0 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground',
          box,
        )}
      >
        RI
      </div>
      <span className={cn('font-semibold tracking-tight', label)}>
        ReachInbox <span className="text-muted-foreground">Scheduler</span>
      </span>
    </div>
  );
}
