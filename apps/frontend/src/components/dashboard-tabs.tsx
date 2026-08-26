'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/scheduled', label: 'Scheduled' },
  { href: '/dashboard/sent', label: 'Sent' },
] as const;

/**
 * Segmented control rather than underlined tabs: it reads as a filter over one
 * dataset, which is what these two views actually are. Routes, not local
 * state, so each is linkable and back-button friendly.
 */
export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Email views"
      className="inline-flex items-center gap-1 rounded-xl border bg-muted/60 p-1"
    >
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
