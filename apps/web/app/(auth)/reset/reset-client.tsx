'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { ApiError, requestPasswordReset } from '@/lib/api';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useId, useState } from 'react';

/**
 * Request a password reset (US12, T093, FR-WEB-013). Submitting always shows the same confirmation —
 * "if that email exists, a link is on its way" — so the page never reveals whether an account exists
 * (no enumeration). The emailed link lands on `/reset/confirm?token=…`. Restyled to design tokens.
 */
export function ResetRequestClient() {
  const formId = useId();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset({ email: email.trim() });
      setSent(true);
    } catch (err) {
      // A transient failure is the only thing worth surfacing; the success path is uniform.
      setError(err instanceof ApiError ? err.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell>
        <h1 className={s.title}>Check your email</h1>
        <p className={s.subtitle}>
          If an account exists for <strong>{email}</strong>, we've sent a link to reset your
          password. The link expires soon, so use it promptly.
        </p>
        <p className={s.footer}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={s.title}>Reset your password</h1>
      <p className={s.subtitle}>Enter your email and we'll send a link to choose a new password.</p>

      <form className={s.form} aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} hidden>
          Request a password reset
        </h2>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />

        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className={s.footer}>
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
