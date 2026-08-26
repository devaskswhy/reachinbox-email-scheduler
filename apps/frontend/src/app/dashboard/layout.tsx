import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { ComposeButton } from '@/components/compose-button';
import { ComposeProvider } from '@/components/compose-provider';
import { DashboardTabs } from '@/components/dashboard-tabs';
import { UserMenu } from '@/components/user-menu';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  // Middleware already gates this path; this is the server-side backstop so a
  // session cannot be assumed non-null purely because of an edge redirect.
  if (session === null) redirect('/login');

  return (
    <ComposeProvider>
      <div className="min-h-screen bg-muted/40">
        <header className="border-b bg-background">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
            <Brand />
            <UserMenu
              name={session.user?.name}
              email={session.user?.email}
              image={session.user?.image}
            />
          </div>

          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 border-t px-6 py-3">
            <DashboardTabs />
            <ComposeButton />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </div>
    </ComposeProvider>
  );
}
