'use client';

import { AuthShell, authStyles as s } from '@/components/auth-shell';
import { ApiError, login, storeSession } from '@/lib/api';
import { safeNext } from '@/lib/auth/routing';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

/**
 * Sign-in form (US1, FR-WEB-011/012). Email + password → `POST /auth/login` → tokens stored → into
 * the app. Invalid credentials surface as a single generic message (no account-existence signal —
 * no enumeration). Repeated failures may be throttled server-side (429), shown plainly. After
 * signing in the user returns to the page the auth gate bounced them from (`?next=`), restricted to
 * same-origin paths. Restyled to design tokens.
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
      const next =
        typeof window === 'undefined'
          ? '/'
          : safeNext(new URLSearchParams(window.location.search).get('next'));
      router.push(next);
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
    <AuthShell>
      <h1 className={s.title}>Sign in</h1>
      <p className={s.subtitle}>Welcome back. Sign in to your workspace.</p>

      <form className={s.form} aria-labelledby={`${formId}-heading`} onSubmit={submit}>
        <h2 id={`${formId}-heading`} hidden>
          Sign in to your account
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
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? (
          <p className={s.error} role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className={s.footer}>
        <Link href="/reset">Forgot your password?</Link>
        <br />
        New here? <Link href="/register">Create an account</Link>
      </p>
    </AuthShell>
  );
}
