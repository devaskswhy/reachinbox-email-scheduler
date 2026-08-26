import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';

import { Providers } from '@/components/providers';

import './globals.css';

/**
 * next/font self-hosts the files at build time, so there is no request to
 * Google at runtime and no flash of unstyled text. Exposed as a CSS variable
 * that tailwind.config.ts reads for `font-sans`.
 */
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'ReachInbox Scheduler',
  description: 'Schedule and throttle outbound email campaigns.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
        <Toaster
          richColors
          closeButton
          position="top-right"
          toastOptions={{ className: 'font-sans' }}
        />
      </body>
    </html>
  );
}
