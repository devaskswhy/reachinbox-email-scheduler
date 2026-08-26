'use client';

import { Plus } from 'lucide-react';

import { useCompose } from '@/components/compose-provider';
import { Button, type ButtonProps } from '@/components/ui/button';

/** Opens the shared compose dialog. Used by the header and both empty states. */
export function ComposeButton({ children = 'Compose New Email', ...props }: ButtonProps) {
  const { openCompose } = useCompose();

  return (
    <Button size="sm" onClick={openCompose} {...props}>
      <Plus aria-hidden />
      {children}
    </Button>
  );
}
