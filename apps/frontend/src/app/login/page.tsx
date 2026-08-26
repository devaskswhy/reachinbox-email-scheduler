'use client';

import { ArrowRight, Clock, Gauge, ShieldCheck } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button } from '@/components/ui/button';

/** Google's mark, inline so nothing external gates the primary action. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
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

const CAPABILITIES = [
  {
    icon: Clock,
    title: 'Scheduled, not sprayed',
    body: 'Every recipient gets its own send window, spaced by the delay you choose.',
  },
  {
    icon: Gauge,
    title: 'Rate limited by design',
    body: 'Per-sender hourly ceilings, enforced across every worker at once.',
  },
  {
    icon: ShieldCheck,
    title: 'Survives restarts',
    body: 'Queued mail is never lost and never sent twice, even mid-deploy.',
  },
] as const;

function LoginPanel() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);

  const errorCode = params.get('error');
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard';
  const errorMessage =
    errorCode === null
      ? null
      : (ERROR_MESSAGES[errorCode] ?? 'Could not sign in. Please try again.');

  return (
    <div className="w-full max-w-md animate-rise">
      <div className="mb-10 flex items-center gap-2.5">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
          RI
        </div>
        <span className="text-[15px] font-semibold tracking-tight">
          ReachInbox <span className="font-normal text-muted-foreground">Scheduler</span>
        </span>
      </div>

      <h1 className="text-balance text-[2.75rem] font-extrabold leading-[1.05] tracking-tighter">
        Send on your
        <br />
        <span className="text-primary">own schedule.</span>
      </h1>

      <p className="mt-5 max-w-sm text-pretty leading-relaxed text-muted-foreground">
        Upload a lead list, pick a window, and let the queue pace every send for you.
      </p>

      {errorMessage !== null && (
        <p
          role="alert"
          className="mt-7 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      )}

      <Button
        size="lg"
        variant="outline"
        className="group mt-9 h-12 w-full justify-between rounded-xl bg-card px-5 text-[15px] shadow-sm"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void signIn('google', { callbackUrl });
        }}
      >
        <span className="flex items-center gap-3">
          <GoogleGlyph />
          {pending ? 'Redirecting…' : 'Continue with Google'}
        </span>
        <ArrowRight
          aria-hidden
          className="transition-transform duration-fast group-hover:translate-x-1"
        />
      </Button>

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        By continuing you agree to the terms of service and privacy policy.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: the action. Kept on a light ground so the form is the focus. */}
      <div className="relative flex items-center justify-center px-6 py-16 sm:px-12 lg:px-16">
        <Suspense fallback={null}>
          <LoginPanel />
        </Suspense>
      </div>

      {/* Right: the pitch. Hidden below lg - on a phone it would push the
          sign-in button below the fold for no benefit. */}
      <aside className="relative hidden overflow-hidden bg-foreground text-background lg:block">
        <div className="grain absolute inset-0" />

        {/* Two soft accent washes instead of a flat panel; large radial
            gradients are cheap and give the dark ground some depth. */}
        <div
          aria-hidden
          className="absolute -right-24 -top-24 size-[30rem] rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-20 size-[26rem] rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative flex h-full flex-col justify-center gap-10 px-16 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Outbound, paced properly
          </p>

          <ul className="flex flex-col gap-9">
            {CAPABILITIES.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="flex animate-rise gap-4"
                style={{ animationDelay: `${String(120 + index * 90)}ms` }}
              >
                <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-background/10 text-primary">
                  <Icon aria-hidden className="size-[18px]" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold tracking-tight">{title}</p>
                  <p className="max-w-xs text-sm leading-relaxed text-background/60">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
