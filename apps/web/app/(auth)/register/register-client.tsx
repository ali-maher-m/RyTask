'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ApiError, register, storeSession } from '../../../lib/api';

/**
 * Sign-up form (US2, T059). Name + email + password → `POST /auth/register` → tokens stored →
 * into the app. Self-registration is allowed only when the organization enables public signup; a
 * 403 is shown as a plain "invite-only" message that points to sign-in. A duplicate email (409) is
 * surfaced plainly. Fields are labelled; errors live in a `role="alert"` region.
 */
export function RegisterClient() {
  const router = useRouter();
  const formId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOnly, setInviteOnly] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await register({ name: name.trim(), email: email.trim(), password });
      storeSession(result);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setInviteOnly(true);
      } else if (err instanceof ApiError && err.status === 409) {
        setError('An account with that email already exists. Try signing in instead.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not create your account.');
      }
      setBusy(false);
    }
  }

  if (inviteOnly) {
    return (
      <main>
        <h1>This workspace is invite-only</h1>
        <p>Ask a teammate to send you an invitation, or sign in if you already have an account.</p>
        <p>
          <Link href="/login">Go to sign in</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>Create your account</h1>
      <form aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} style={{ position: 'absolute', left: '-9999px' }}>
          Create a new account
        </h2>
        <p>
          <label htmlFor={`${formId}-name`}>Your name</label>
          <br />
          <input
            id={`${formId}-name`}
            type="text"
            autoComplete="name"
            required
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </p>
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
          {busy ? 'Creating your account…' : 'Create account'}
        </button>
      </form>

      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
