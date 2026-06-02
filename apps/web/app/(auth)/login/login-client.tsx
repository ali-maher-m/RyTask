'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ApiError, login, storeSession } from '../../../lib/api';

/**
 * Sign-in form (US2, T059). Email + password → `POST /auth/login` → tokens stored → into the app.
 * Invalid credentials surface as a single generic message (no account-existence signal — no
 * enumeration). Repeated failures may be throttled server-side (429), shown plainly. Every field
 * is labelled for accessibility; errors live in a `role="alert"` region.
 */
export function LoginClient() {
  const router = useRouter();
  const formId = useId();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await login({ email: email.trim(), password });
      storeSession(result);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError('That email or password is incorrect.');
      }
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign in</h1>
      <form aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} style={{ position: 'absolute', left: '-9999px' }}>
          Sign in to your account
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
        <p>
          <label htmlFor={`${formId}-password`}>Password</label>
          <br />
          <input
            id={`${formId}-password`}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p>
        <Link href="/reset">Forgot your password?</Link>
      </p>
      <p>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </main>
  );
}
