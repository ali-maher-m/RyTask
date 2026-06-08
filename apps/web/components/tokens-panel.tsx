'use client';

import { ApiError, createToken, listTokens, revokeToken } from '@/lib/api';
import { useOrg } from '@/lib/org/org-context';
import type { ApiTokenDto, ApiTokenSecret, ApiTokenType } from '@rytask/contracts';
import { Badge, Button, Input, Select } from '@rytask/ui';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Personal Access Token panel (M0 US9, FR-WEB-074, NFR-WEB-005, SC-012) — extracted so it can be
 * reused verbatim by both the Tokens settings page and the M3 Agent-access page (research D15:
 * reuse, don't rebuild). Mint a token with a limited scope (effective permission is always
 * scope ∩ your role), **copy the secret once** — never shown again, never in a URL or logged —
 * list tokens with last-used time, and revoke any token immediately. Token-only styling;
 * figures/dates render in the org timezone/locale via `useOrg`.
 */
const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-3)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};
const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const TOKEN_TYPES: ApiTokenType[] = ['PAT', 'MCP'];

export function TokensPanel() {
  const formId = useId();
  const { formatDate } = useOrg();
  const [tokens, setTokens] = useState<ApiTokenDto[] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ApiTokenType>('PAT');
  const [scopes, setScopes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<ApiTokenSecret | null>(null);

  const formatWhen = useCallback(
    (iso: string | null): string =>
      iso ? formatDate(iso, { hour: '2-digit', minute: '2-digit' }) : 'never',
    [formatDate],
  );

  const load = useCallback(async () => {
    try {
      setTokens(await listTokens());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your tokens.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setMinted(null);
    try {
      const parsedScopes = scopes
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const token = await createToken({ name: name.trim(), type, scopes: parsedScopes });
      setMinted(token);
      setName('');
      setScopes('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the token.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeToken(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not revoke the token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={mint} aria-labelledby={`${formId}-heading`} style={CARD}>
        <h2 id={`${formId}-heading`} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
          Create a token
        </h2>

        <Input
          id={`${formId}-name`}
          label="Name"
          type="text"
          required
          maxLength={120}
          value={name}
          disabled={busy}
          placeholder="e.g. CI deploy bot"
          onChange={(e) => setName(e.target.value)}
        />

        <div>
          <label htmlFor={`${formId}-type`} style={LABEL}>
            Type
          </label>
          <Select
            id={`${formId}-type`}
            value={type}
            disabled={busy}
            onChange={(e) => setType(e.target.value as ApiTokenType)}
          >
            {TOKEN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>

        <Input
          id={`${formId}-scopes`}
          label="Scopes"
          type="text"
          value={scopes}
          disabled={busy}
          placeholder="comma-separated, e.g. work-items:read, projects:read"
          hint="Leave blank for a token limited to your role."
          onChange={(e) => setScopes(e.target.value)}
        />

        {error ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Create token
          </Button>
        </div>
      </form>

      {minted ? (
        <section aria-label="New token secret" style={{ ...CARD, borderColor: 'var(--success)' }}>
          <h2 style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>Copy your new token now</h2>
          <p style={{ margin: 0 }}>
            This is the only time we'll show it. Store it somewhere safe — you won't be able to see
            it again.
          </p>
          <code
            data-testid="token-secret"
            style={{ ...MONO, wordBreak: 'break-all', color: 'var(--fg)' }}
          >
            {minted.secret}
          </code>
          <div>
            <Button type="button" variant="secondary" onClick={() => setMinted(null)}>
              I've copied it
            </Button>
          </div>
        </section>
      ) : null}

      <h2 style={{ fontSize: 'var(--fs-h2)', marginTop: 'var(--space-5)' }}>Your tokens</h2>
      {!tokens ? (
        <p style={{ color: 'var(--fg-muted)' }}>Loading…</p>
      ) : tokens.length === 0 ? (
        <p style={{ color: 'var(--fg-muted)' }}>You don't have any tokens yet.</p>
      ) : (
        <ul aria-label="Your access tokens" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {tokens.map((t) => (
            <li
              key={t.id}
              data-testid="token-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) 0',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 'var(--w-medium)' }}>{t.name}</span>{' '}
                <Badge tone="neutral">{t.type}</Badge>
                <span
                  style={{ display: 'block', fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}
                >
                  Scopes:{' '}
                  <span style={MONO}>
                    {t.scopes.length > 0 ? t.scopes.join(', ') : 'role-limited'}
                  </span>{' '}
                  · Last used: <span style={MONO}>{formatWhen(t.lastUsedAt)}</span> · Created:{' '}
                  <span style={MONO}>{formatWhen(t.createdAt)}</span>
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => revoke(t.id)}
                aria-label={`Revoke token ${t.name}`}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
