import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-muted text-muted-foreground',
        accent: 'border-transparent bg-primary/10 text-primary',
        info: 'border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300',
        warning: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
        success:
          'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        danger: 'border-transparent bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
