'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { ApiError, confirmPasswordReset } from '@/lib/api';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';

/**
 * Set a new password from a reset link (US12, T094, FR-WEB-013). The single-use token comes from the
 * emailed URL (`?token=…`); we read it from the address bar so no Suspense boundary is needed. A used
 * or expired token is rejected with a plain message that routes back to "request a new link".
 * Restyled to design tokens.
 */
export function ResetConfirmClient() {
  const formId = useId();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset({ token, newPassword: password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        setError('This reset link is no longer valid — it may have expired or already been used.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
      }
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <h1 className={s.title}>Password updated</h1>
        <p className={s.subtitle}>Your new password is ready. You can sign in with it now.</p>
        <p className={s.footer}>
          <Link href="/login">Go to sign in</Link>
        </p>
      </AuthShell>
    );
  }

  if (token === null) {
    return (
      <AuthShell>
        <h1 className={s.title}>Reset link needed</h1>
        <p className={s.subtitle}>Open the link from your password-reset email to continue.</p>
        <p className={s.footer}>
          <Link href="/reset">Request a new link</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={s.title}>Choose a new password</h1>

      <form className={s.form} aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} hidden>
          Set a new password
        </h2>
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />

        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </Button>
      </form>

      {error ? (
        <p className={s.footer}>
          <Link href="/reset">Request a new link</Link>
        </p>
      ) : null}
    </AuthShell>
  );
}
