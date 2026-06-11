'use client';

import {
  ApiError,
  createGithubConnection,
  deleteGithubConnection,
  listGithubConnections,
} from '@/lib/api';
import { API_BASE } from '@/lib/api/http';
import { reason } from '@/lib/auth/capabilities';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useOrg } from '@/lib/org/org-context';
import type { GithubConnectionDto } from '@rytask/contracts';
import { Badge, Button, Input, Tooltip } from '@rytask/ui';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * GitHub lightweight-linking manager (M5, AC-11, FR-INT-GH-006/007). Owners/admins connect a
 * repository: RyTask mints the webhook secret and shows it ONCE, alongside the webhook URL to
 * paste into the repo's settings (events: push + pull request). From then on, commits/PRs whose
 * message says e.g. `Fixes RY-12` appear in that item's activity. Non-admins see status
 * read-only with a plain reason. Token-only styling; mono for URLs/secrets (they're figures).
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
const ROW: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' };
const MONO: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-sm)',
  fontVariantNumeric: 'tabular-nums',
  wordBreak: 'break-all',
};
const HINT: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)', margin: 0 };

/** The one-time material shown after a connect (never retrievable again). */
interface MintedSecret {
  repoFullName: string;
  webhookUrl: string;
  webhookSecret: string;
}

export function GithubCard() {
  const headingId = useId();
  const { can } = useCapabilities();
  const { formatDate } = useOrg();
  const canManage = can('integrations:admin');

  const [connections, setConnections] = useState<GithubConnectionDto[] | null>(null);
  const [repoName, setRepoName] = useState('');
  const [minted, setMinted] = useState<MintedSecret | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listGithubConnections();
      setConnections(res.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the GitHub integration.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    if (busy || repoName.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createGithubConnection({ repoFullName: repoName.trim() });
      setMinted({
        repoFullName: res.data.repoFullName,
        webhookUrl: `${API_BASE}${res.data.webhookPath}`,
        webhookSecret: res.webhookSecret,
      });
      setRepoName('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not connect the repository.');
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteGithubConnection(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not disconnect the repository.');
    } finally {
      setBusy(false);
    }
  }

  const active = (connections ?? []).filter((c) => !c.revokedAt);

  return (
    <section aria-labelledby={headingId} style={CARD} data-testid="github-card">
      <div style={{ ...ROW, justifyContent: 'space-between' }}>
        <h2 id={headingId} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
          GitHub
        </h2>
        {connections ? (
          <Badge tone={active.length > 0 ? 'success' : 'neutral'}>
            {active.length > 0 ? 'Connected' : 'Not connected'}
          </Badge>
        ) : (
          <Badge tone="neutral">Loading…</Badge>
        )}
      </div>

      <p style={HINT}>
        Link code to work without leaving GitHub: a commit or pull request that mentions an item key
        — like <code>Fixes RY-12</code> — shows up in that item's activity.
      </p>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
          {error}
        </p>
      ) : null}

      {connections && connections.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gap: 'var(--space-2)',
          }}
        >
          {connections.map((c) => (
            <li
              key={c.id}
              style={{ ...ROW, justifyContent: 'space-between' }}
              data-testid="github-repo"
            >
              <span style={MONO}>{c.repoFullName}</span>
              <span style={ROW}>
                {c.revokedAt ? (
                  <Badge tone="neutral">Disconnected</Badge>
                ) : (
                  <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}>
                    since {formatDate(c.connectedAt)}
                  </span>
                )}
                {canManage && !c.revokedAt ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onDisconnect(c.id)}
                    data-testid={`disconnect-github-${c.repoFullName}`}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {canManage ? (
        <form onSubmit={onConnect} style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <label
            htmlFor={`${headingId}-repo`}
            style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' }}
          >
            Repository to connect (owner/repo)
          </label>
          <div style={ROW}>
            <Input
              id={`${headingId}-repo`}
              value={repoName}
              placeholder="acme/web"
              onChange={(e) => setRepoName(e.target.value)}
              disabled={busy}
              style={{ maxWidth: '20rem' }}
            />
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              data-testid="connect-github"
              disabled={repoName.trim().length === 0}
            >
              Connect repository
            </Button>
          </div>
        </form>
      ) : (
        <Tooltip content={reason('integrations:admin')}>
          <span
            data-testid="github-manage-reason"
            style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-faint)' }}
          >
            {reason('integrations:admin')}
          </span>
        </Tooltip>
      )}

      {minted ? (
        <output
          data-testid="github-secret"
          style={{
            display: 'grid',
            gap: 'var(--space-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: 'var(--space-3)',
            background: 'var(--surface-raised)',
          }}
        >
          <strong>{minted.repoFullName} is ready — finish the setup in GitHub.</strong>
          <span style={HINT}>
            In the repository, open Settings → Webhooks → Add webhook. Use content type
            “application/json” and send the “push” and “pull request” events. This secret is shown
            only once.
          </span>
          <span>
            Payload URL: <span style={MONO}>{minted.webhookUrl}</span>
          </span>
          <span>
            Secret: <span style={MONO}>{minted.webhookSecret}</span>
          </span>
        </output>
      ) : null}
    </section>
  );
}
