'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The Scheduled tab polls every 15s, so a short stale window keeps a
        // tab switch from firing a redundant request immediately after one.
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // A 4xx is the server saying the request itself is wrong; retrying
          // it just repeats the same failure. Only transient faults are worth
          // another attempt.
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // Created in state, not at module scope: a module-level client would be
  // shared across every request on the server and leak one user's cached data
  // into another's render.
  const [queryClient] = useState(createQueryClient);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
