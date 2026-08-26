import type { Metadata } from 'next';

import { Providers } from '@/components/providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'ReachInbox Scheduler',
  description: 'Schedule and throttle outbound email campaigns.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
