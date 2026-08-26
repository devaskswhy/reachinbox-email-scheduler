'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

/**
 * useSession() needs this context, and context cannot cross the server
 * boundary - so the provider is a client component wrapped around the tree in
 * the root layout, which itself stays a server component.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
