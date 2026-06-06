'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { verifyEmail } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Confirm an email address from a verification link (US12, T095, FR-WEB-013). The token comes from
 * the emailed URL (`?token=…`); we read it from the address bar and verify on mount, then show
 * success (which lifts the unverified-account restriction per org policy) or a plain "expired link"
 * message. No input is required — it's a one-tap confirmation. Restyled to design tokens.
 */
type State = 'pending' | 'ok' | 'invalid' | 'missing';

export function VerifyEmailClient() {
  const [state, setState] = useState<State>('pending');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('missing');
      return;
    }
    verifyEmail({ token })
      .then(() => setState('ok'))
      .catch(() => setState('invalid'));
  }, []);

  return (
    <AuthShell>
      <div aria-live="polite">
        {state === 'pending' ? (
          <>
            <h1 className={s.title}>Verifying your email…</h1>
            <p className={s.subtitle}>One moment.</p>
          </>
        ) : null}

        {state === 'ok' ? (
          <>
            <h1 className={s.title}>Email verified</h1>
            <p className={s.subtitle}>Thanks — your email address is confirmed.</p>
            <p className={s.footer}>
              <Link href="/">Go to your workspace</Link>
            </p>
          </>
        ) : null}

        {state === 'invalid' ? (
          <>
            <h1 className={s.title}>This link didn't work</h1>
            <p className={s.subtitle}>
              The verification link is no longer valid — it may have expired or already been used.
              Sign in to request a new one.
            </p>
            <p className={s.footer}>
              <Link href="/login">Go to sign in</Link>
            </p>
          </>
        ) : null}

        {state === 'missing' ? (
          <>
            <h1 className={s.title}>Verification link needed</h1>
            <p className={s.subtitle}>
              Open the link from your verification email to confirm your address.
            </p>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
