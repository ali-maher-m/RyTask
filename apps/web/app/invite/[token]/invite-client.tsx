'use client';

import { ApiError, acceptInvite, getInvitePreview, storeSession } from '@/lib/api';
import type { InvitePreview, Role } from '@rytask/contracts';
import { Button, Input } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';

/**
 * Accept an invitation (US9, T079, FR-WEB-071, SC-004). Previews the organization and the role you'll
 * join as, then — for a brand-new teammate — collects a name and password to create the account and
 * join in one step. Expired / used / revoked invites are refused with a plain, kind message and **no
 * membership side-effect** (no account is created). Plain language throughout, token-only styling, no
 * training needed (the Albert/Marissa test).
 */
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
  VIEWER: 'Viewer (read-only)',
};

const NO_LONGER_VALID =
  'This invitation is no longer valid. It may have expired or already been used.';

const MAIN: React.CSSProperties = {
  maxWidth: '28rem',
  margin: '0 auto',
  padding: 'var(--space-6) var(--space-4)',
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
            ? NO_LONGER_VALID
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
        setLoadError(NO_LONGER_VALID);
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not accept the invitation.');
      }
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Invitation unavailable</h1>
        <p role="alert" style={{ color: 'var(--error)' }}>
          {loadError}
        </p>
        <p>
          <Link href="/login" style={{ color: 'var(--accent)' }}>
            Go to sign in
          </Link>
        </p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Loading your invitation…</h1>
        <p style={{ color: 'var(--fg-muted)' }}>One moment.</p>
      </main>
    );
  }

  return (
    <main style={MAIN}>
      <h1 style={{ fontSize: 'var(--fs-h1)' }}>Join {preview.organizationName}</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        You've been invited to join <strong>{preview.organizationName}</strong> as{' '}
        <strong>{ROLE_LABELS[preview.role] ?? preview.role}</strong>
        {preview.email ? <> ({preview.email})</> : null}.
      </p>

      <form
        onSubmit={accept}
        aria-labelledby={`${formId}-heading`}
        style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}
      >
        <h2 id={`${formId}-heading`} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
          Create your account to join
        </h2>

        <Input
          id={`${formId}-name`}
          label="Your name"
          type="text"
          autoComplete="name"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />

        <Input
          id={`${formId}-password`}
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters. Already have an account? You can leave these blank."
        />

        {error ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" loading={busy}>
            {`Join ${preview.organizationName}`}
          </Button>
        </div>
      </form>
    </main>
  );
}
