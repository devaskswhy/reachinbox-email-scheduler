'use client';

import { useId, type ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label: string;
  /** Renders the control; receives wiring for label, hint and error. */
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': boolean | undefined;
  }) => ReactNode;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
}

/**
 * Owns label/control/hint/error association so no screen has to remember the
 * aria wiring. The render-prop shape means it works with any control - Input,
 * Textarea, or a bespoke widget - without wrapping or cloning it.
 */
export function FormField({
  label,
  children,
  hint,
  error,
  optional = false,
  className,
}: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // Error wins: pointing at both would have a screen reader read the hint
  // before the thing that actually needs fixing.
  const describedBy =
    error !== undefined ? errorId : hint !== undefined ? hintId : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional && <span className="text-xs text-muted-foreground">Optional</span>}
      </div>

      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error !== undefined ? true : undefined,
      })}

      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint !== undefined && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
