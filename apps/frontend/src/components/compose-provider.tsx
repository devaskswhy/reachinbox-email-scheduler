'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ComposeDialog } from '@/components/compose-dialog';

interface ComposeContextValue {
  openCompose: () => void;
}

const ComposeContext = createContext<ComposeContextValue | null>(null);

/**
 * Mounts a single compose dialog for the whole dashboard and exposes an opener.
 *
 * Both the header button and each table's empty state need to open it. Without
 * a shared instance each call site would own its own dialog, so two could be
 * mounted at once and form state would depend on which button was pressed.
 */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openCompose = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openCompose }), [openCompose]);

  return (
    <ComposeContext.Provider value={value}>
      {children}
      <ComposeDialog open={open} onOpenChange={setOpen} />
    </ComposeContext.Provider>
  );
}

export function useCompose(): ComposeContextValue {
  const context = useContext(ComposeContext);
  if (context === null) {
    throw new Error('useCompose must be used inside a ComposeProvider');
  }
  return context;
}
