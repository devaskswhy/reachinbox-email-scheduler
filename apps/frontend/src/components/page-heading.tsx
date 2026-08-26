import type { ReactNode } from 'react';

import { ComposeButton } from '@/components/compose-button';
import { DashboardTabs } from '@/components/dashboard-tabs';

/**
 * Shared page frame for both tabs: title block left, view switcher and the
 * primary action right. Lives here rather than in the layout so each page owns
 * its own copy and Next's layout file keeps a single default export.
 */
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-extrabold tracking-tighter">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <DashboardTabs />
          <ComposeButton />
        </div>
      </div>
      {children}
    </section>
  );
}
