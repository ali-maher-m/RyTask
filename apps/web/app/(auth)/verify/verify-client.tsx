'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { verifyEmail } from '../../../lib/api';

/**
 * Confirm an email address from a verification link (US6, T090). The token comes from the emailed
 * URL (`?token=…`); we read it from the address bar and verify on mount, then show success or a
 * plain "expired link" message. No input is required — it's a one-tap confirmation.
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
    <main aria-live="polite">
      {state === 'pending' ? (
        <>
          <h1>Verifying your email…</h1>
          <p>One moment.</p>
        </>
      ) : null}

      {state === 'ok' ? (
        <>
          <h1>Email verified</h1>
          <p>Thanks — your email address is confirmed.</p>
          <p>
            <Link href="/">Go to your workspace</Link>
          </p>
        </>
      ) : null}

      {state === 'invalid' ? (
        <>
          <h1>This link didn't work</h1>
          <p>The verification link is invalid or has expired. Sign in to request a new one.</p>
          <p>
            <Link href="/login">Go to sign in</Link>
          </p>
        </>
      ) : null}

      {state === 'missing' ? (
        <>
          <h1>Verification link needed</h1>
          <p>Open the link from your verification email to confirm your address.</p>
        </>
      ) : null}
    </main>
  );
}
