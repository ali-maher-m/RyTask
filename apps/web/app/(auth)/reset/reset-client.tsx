'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ApiError, requestPasswordReset } from '../../../lib/api';

/**
 * Request a password reset (US6, T090, SC-010). Submitting always shows the same confirmation —
 * "if that email exists, a link is on its way" — so the page never reveals whether an account
 * exists (no enumeration). The emailed link lands on `/reset/confirm?token=…`.
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
      <main>
        <h1>Check your email</h1>
        <p>
          If an account exists for <strong>{email}</strong>, we've sent a link to reset your
          password. The link expires soon, so use it promptly.
        </p>
        <p>
          <Link href="/login">Back to sign in</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Reset your password</h1>
      <p>Enter your email and we'll send you a link to choose a new password.</p>
      <form aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} style={{ position: 'absolute', left: '-9999px' }}>
          Request a password reset
        </h2>
        <p>
          <label htmlFor={`${formId}-email`}>Email</label>
          <br />
          <input
            id={`${formId}-email`}
            type="email"
            autoComplete="email"
            required
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p>
        <Link href="/login">Back to sign in</Link>
      </p>
    </main>
  );
}
