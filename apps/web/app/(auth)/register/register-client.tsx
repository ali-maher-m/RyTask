'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { ApiError, register, storeSession } from '@/lib/api';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

/**
 * Sign-up form (US1, FR-WEB-011). Name + email + password → `POST /auth/register` → tokens stored →
 * into the app. Self-registration is allowed only when the organization enables public signup; a
 * 403 is shown as a plain "invite-only" message that points to sign-in. A duplicate email (409) is
 * surfaced plainly. Restyled to design tokens with inline validation.
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
      <AuthShell>
        <h1 className={s.title}>This workspace is invite-only</h1>
        <p className={s.subtitle}>
          Ask a teammate to send you an invitation, or sign in if you already have an account.
        </p>
        <Link href="/login">Go to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className={s.title}>Create your account</h1>
      <p className={s.subtitle}>Join your team's workspace.</p>

      <form className={s.form} aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} hidden>
          Create a new account
        </h2>
        <Input
          label="Your name"
          autoComplete="name"
          required
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
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
          {busy ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>

      <p className={s.footer}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
