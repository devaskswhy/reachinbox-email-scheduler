'use client';

import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Action row pinned to the bottom, outside the scrolling body. */
  footer?: ReactNode;
  className?: string;
  /**
   * Blocks overlay clicks and Escape. Used while a submit is in flight so a
   * stray click cannot dismiss the dialog mid-request and lose the form.
   */
  dismissible?: boolean;
}

/**
 * Generic dialog shell: title, scrollable body, sticky footer. Screen-specific
 * dialogs supply only their fields, so none of them re-implement layout,
 * focus trapping or the close affordance.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  dismissible = true,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-h-[90vh] max-w-xl grid-rows-[auto_1fr_auto]', className)}
        onInteractOutside={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* -mx/px pair keeps focus rings from being clipped by overflow. */}
        <div className="-mx-1 overflow-y-auto px-1 py-1">{children}</div>

        {footer !== undefined && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
