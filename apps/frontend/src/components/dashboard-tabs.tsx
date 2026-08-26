'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/dashboard/scheduled', label: 'Scheduled Emails' },
  { href: '/dashboard/sent', label: 'Sent Emails' },
] as const;

/**
 * Tabs are real routes rather than local state, so a tab is linkable,
 * refreshable and back-button friendly. Active state comes from the pathname.
 */
export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Email views" className="flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {/* The one accent again: the active underline matches every other
                interactive element because it reads from --primary. */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
