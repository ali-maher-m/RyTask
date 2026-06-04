'use client';

import { ApiError, authedRequest } from '@/lib/api';
import type { ApiTokenDto, ApiTokenSecret, ApiTokenType } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Personal Access Token manager (US7, T100, SC-012). Mint a token with a limited scope (effective
 * permission is always scope ∩ your role), copy the secret once — it's never shown again — list
 * tokens with their last-used time, and revoke any token. Tokens authenticate non-UI callers
 * (CLI, CI, MCP agents) on your behalf.
 */
const TOKEN_TYPES: ApiTokenType[] = ['PAT', 'MCP'];

function listTokens(): Promise<ApiTokenDto[]> {
  return authedRequest<ApiTokenDto[]>('/api-tokens');
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function TokensClient() {
  const formId = useId();
  const [tokens, setTokens] = useState<ApiTokenDto[] | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<ApiTokenType>('PAT');
  const [scopes, setScopes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<ApiTokenSecret | null>(null);

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
      const token = await authedRequest<ApiTokenSecret>('/api-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), type, scopes: parsedScopes }),
      });
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
      await authedRequest<void>(`/api-tokens/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not revoke the token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Access tokens</h1>
        <nav>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <p>
        Tokens let tools and AI agents act on your behalf. A token can only ever do what your role
        allows.
      </p>

      <form aria-labelledby={`${formId}-heading`} onSubmit={mint}>
        <h2 id={`${formId}-heading`}>Create a token</h2>
        <p>
          <label htmlFor={`${formId}-name`}>Name</label>
          <br />
          <input
            id={`${formId}-name`}
            type="text"
            required
            maxLength={120}
            value={name}
            disabled={busy}
            placeholder="e.g. CI deploy bot"
            onChange={(e) => setName(e.target.value)}
          />
        </p>
        <p>
          <label htmlFor={`${formId}-type`}>Type</label>
          <br />
          <select
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
          </select>
        </p>
        <p>
          <label htmlFor={`${formId}-scopes`}>Scopes</label>
          <br />
          <input
            id={`${formId}-scopes`}
            type="text"
            value={scopes}
            disabled={busy}
            placeholder="comma-separated, e.g. work-items:read, projects:read"
            onChange={(e) => setScopes(e.target.value)}
            aria-describedby={`${formId}-scopes-hint`}
          />
          <br />
          <small id={`${formId}-scopes-hint`}>Leave blank for a token limited to your role.</small>
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>

      {minted ? (
        <section
          aria-label="New token secret"
          style={{ border: '1px solid #1a7f37', padding: '0.75rem', margin: '1rem 0' }}
        >
          <h2>Copy your new token now</h2>
          <p>
            This is the only time we'll show it. Store it somewhere safe — you won't be able to see
            it again.
          </p>
          <p>
            <code data-testid="token-secret" style={{ wordBreak: 'break-all' }}>
              {minted.secret}
            </code>
          </p>
          <button type="button" onClick={() => setMinted(null)}>
            I've copied it
          </button>
        </section>
      ) : null}

      <h2>Your tokens</h2>
      {!tokens ? (
        <p>Loading…</p>
      ) : tokens.length === 0 ? (
        <p>You don't have any tokens yet.</p>
      ) : (
        <ul aria-label="Your access tokens" style={{ listStyle: 'none', padding: 0 }}>
          {tokens.map((t) => (
            <li
              key={t.id}
              style={{ borderTop: '1px solid #e3e5e8', padding: '0.5rem 0' }}
              data-testid="token-row"
            >
              <strong>{t.name}</strong> <span>({t.type})</span>
              <br />
              <small>
                Scopes: {t.scopes.length > 0 ? t.scopes.join(', ') : 'role-limited'} · Last used:{' '}
                {formatWhen(t.lastUsedAt)} · Created: {formatWhen(t.createdAt)}
              </small>
              <br />
              <button
                type="button"
                onClick={() => void revoke(t.id)}
                disabled={busy}
                aria-label={`Revoke token ${t.name}`}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
