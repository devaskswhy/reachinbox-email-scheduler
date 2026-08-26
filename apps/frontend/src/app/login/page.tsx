'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';

/** Google's mark. Inline so the CSP-free asset never blocks the button. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.55-2.03-6.46-4.76H1.69v2.98A11.5 11.5 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.54 14.65a6.9 6.9 0 0 1 0-4.4V7.27H1.69a11.51 11.51 0 0 0 0 10.36l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.2 15.1 0 12 0 7.5 0 3.6 2.58 1.69 6.34l3.85 2.98C6.45 6.78 9 4.75 12 4.75Z"
      />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: 'That email is already linked to a different sign-in method.',
  AccessDenied: 'Access denied. Your Google account was not permitted to sign in.',
  Configuration: 'Sign-in is not configured. Check the Google OAuth credentials.',
};

function LoginCard() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);

  const errorCode = params.get('error');
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const errorMessage =
    errorCode === null
      ? null
      : (ERROR_MESSAGES[errorCode] ?? 'Could not sign in. Please try again.');

  return (
    <Card className="w-full max-w-sm animate-fade-up border-border/70 shadow-lg">
      <CardContent className="flex flex-col items-center gap-6 p-8">
        <Brand size="lg" className="flex-col gap-3 text-center" />

        <div className="space-y-1.5 text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to schedule and track your email campaigns.
          </CardDescription>
        </div>

        {errorMessage !== null && (
          <p
            role="alert"
            className="w-full rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <Button
          size="lg"
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void signIn('google', { callbackUrl });
          }}
        >
          <GoogleGlyph />
          {pending ? 'Redirecting…' : 'Continue with Google'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the terms of service and privacy policy.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 px-6">
      {/* useSearchParams needs a Suspense boundary to stay statically renderable. */}
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}
