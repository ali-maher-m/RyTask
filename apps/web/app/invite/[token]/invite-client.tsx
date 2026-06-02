'use client';

import type { InvitePreview, Role } from '@rytask/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { ApiError, acceptInvite, getInvitePreview, storeSession } from '../../../lib/api';

/**
 * Accept an invitation (US3, T069, SC-004). Previews the organization and the role you'll join as,
 * then — for a brand-new teammate — collects a name and password to create the account and join in
 * one step. Expired/used/revoked invites are refused with a plain message and no account is
 * created. Plain language throughout, no training needed.
 */
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
  VIEWER: 'Viewer (read-only)',
};

export function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const formId = useId();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getInvitePreview(token)
      .then((p) => {
        if (active) setPreview(p);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError && (err.status === 404 || err.status === 410)
            ? 'This invitation is no longer valid. It may have expired or already been used.'
            : 'We could not load this invitation. Please check the link and try again.',
        );
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptInvite(token, {
        name: name.trim() || undefined,
        password: password || undefined,
      });
      storeSession(result);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setLoadError(
          'This invitation is no longer valid. It may have expired or already been used.',
        );
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not accept the invitation.');
      }
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main>
        <h1>Invitation unavailable</h1>
        <p role="alert">{loadError}</p>
        <p>
          <Link href="/login">Go to sign in</Link>
        </p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main>
        <h1>Loading your invitation…</h1>
        <p>One moment.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Join {preview.organizationName}</h1>
      <p>
        You've been invited to join <strong>{preview.organizationName}</strong> as{' '}
        <strong>{ROLE_LABELS[preview.role] ?? preview.role}</strong>
        {preview.email ? (
          <>
            {' '}
            (<span>{preview.email}</span>)
          </>
        ) : null}
        .
      </p>

      <form aria-labelledby={`${formId}-heading`} onSubmit={accept}>
        <h2 id={`${formId}-heading`}>Create your account to join</h2>
        <p>
          <label htmlFor={`${formId}-name`}>Your name</label>
          <br />
          <input
            id={`${formId}-name`}
            type="text"
            autoComplete="name"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </p>
        <p>
          <label htmlFor={`${formId}-password`}>Choose a password</label>
          <br />
          <input
            id={`${formId}-password`}
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={`${formId}-password-hint`}
          />
          <br />
          <small id={`${formId}-password-hint`}>
            At least 8 characters. Already have an account? You can leave these blank.
          </small>
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Joining…' : `Join ${preview.organizationName}`}
        </button>
      </form>
    </main>
  );
}
