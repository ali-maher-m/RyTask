'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ApiError, confirmPasswordReset } from '../../../../lib/api';

/**
 * Set a new password from a reset link (US6, T090). The single-use token comes from the emailed
 * URL (`?token=…`); we read it from the address bar so no Suspense boundary is needed. A used or
 * expired token is rejected with a plain message that routes back to "request a new link".
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
        setError('This reset link is invalid or has expired. Please request a new one.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not reset your password.');
      }
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main>
        <h1>Password updated</h1>
        <p>Your new password is ready. You can sign in with it now.</p>
        <p>
          <Link href="/login">Go to sign in</Link>
        </p>
      </main>
    );
  }

  if (token === null) {
    return (
      <main>
        <h1>Reset link needed</h1>
        <p>Open the link from your password-reset email to continue.</p>
        <p>
          <Link href="/reset">Request a new link</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} style={{ position: 'absolute', left: '-9999px' }}>
          Set a new password
        </h2>
        <p>
          <label htmlFor={`${formId}-password`}>New password</label>
          <br />
          <input
            id={`${formId}-password`}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={`${formId}-password-hint`}
          />
          <br />
          <small id={`${formId}-password-hint`}>At least 8 characters.</small>
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </main>
  );
}
