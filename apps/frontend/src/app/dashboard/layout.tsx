import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { ComposeProvider } from '@/components/compose-provider';
import { UserMenu } from '@/components/user-menu';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  // Middleware already gates this path; this is the server-side backstop so a
  // session cannot be assumed non-null purely because of an edge redirect.
  if (session === null) redirect('/login');

  return (
    <ComposeProvider>
      <div className="min-h-screen">
        {/* Sticky so the tabs and Compose stay reachable down a long table. */}
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
            <Brand />
            <UserMenu
              name={session.user?.name}
              email={session.user?.email}
              image={session.user?.image}
            />
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </div>
    </ComposeProvider>
  );
}
