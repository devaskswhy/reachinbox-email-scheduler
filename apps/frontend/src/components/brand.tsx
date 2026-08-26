import { cn } from '@/lib/utils';

/** App mark plus wordmark. One file to swap when a real logo lands. */
export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground"
      >
        RI
      </div>
      <span className="text-[15px] font-semibold tracking-tight">
        ReachInbox <span className="font-normal text-muted-foreground">Scheduler</span>
      </span>
    </div>
  );
}
