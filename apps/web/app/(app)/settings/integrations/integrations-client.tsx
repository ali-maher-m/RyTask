'use client';

import {
  ApiError,
  disconnectSlack,
  getSlackConnection,
  getSlackInstallUrl,
  listProjects,
  updateSlackConnection,
} from '@/lib/api';
import { reason } from '@/lib/auth/capabilities';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useOrg } from '@/lib/org/org-context';
import type { Project, SlackConnectionDto } from '@rytask/contracts';
import { Badge, Button, Dialog, Select, Tooltip } from '@rytask/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Slack integration manager (US1, FR-WEB-101/103). Owners/admins connect a Slack workspace via
 * the consent flow (auth is cookieless, so we fetch the consent URL with the bearer token, then
 * navigate the page to Slack), set the capture default project, and disconnect (with a clear
 * consequence). Non-admins see status **read-only** — controls render disabled with a plain
 * reason (the server stays authoritative; a slipped-through write reconciles to 403). Token-only
 * styling; figures/dates render in the org timezone/locale via `useOrg`.
 */
const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '44rem' };
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
const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
};

export function IntegrationsClient() {
  const formId = useId();
  const { can } = useCapabilities();
  const { formatDate } = useOrg();
  const params = useSearchParams();
  const canManage = can('integrations:admin');

  const [connection, setConnection] = useState<SlackConnectionDto | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Surface the OAuth return (no secrets in the URL — just a status flag).
  useEffect(() => {
    if (params.get('connected') === '1') {
      setNotice('Connected to Slack.');
    } else if (params.get('error')) {
      setError("We couldn't finish connecting to Slack. Please try again.");
    }
  }, [params]);

  const load = useCallback(async () => {
    try {
      const conn = await getSlackConnection();
      setConnection(conn);
      if (canManage && conn.status === 'connected') {
        setProjects(await listProjects());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the Slack integration.');
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onConnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await getSlackInstallUrl();
      window.location.href = url; // full-page navigation to Slack's consent screen
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the Slack connection.');
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    setError(null);
    setConfirmDisconnect(false);
    try {
      await disconnectSlack();
      setNotice('Disconnected from Slack.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not disconnect Slack.');
    } finally {
      setBusy(false);
    }
  }

  async function onSetDefaultProject(projectId: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateSlackConnection({ defaultProjectId: projectId || null });
      setConnection(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the default project.');
    } finally {
      setBusy(false);
    }
  }

  const isConnected = connection?.status === 'connected';

  return (
    <main style={MAIN}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Integrations</h1>
        <nav>
          <Link href="/settings/organization" style={{ color: 'var(--accent)' }}>
            Organization settings
          </Link>
        </nav>
      </header>
      <p style={{ color: 'var(--fg-muted)' }}>
        Connect Slack so your team can capture tasks with <code>/task</code> without leaving the
        conversation.
      </p>

      {notice ? (
        <output style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--success)' }}>
          {notice}
        </output>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      ) : null}

      <section aria-labelledby={`${formId}-slack`} style={CARD}>
        <div style={{ ...ROW, justifyContent: 'space-between' }}>
          <h2 id={`${formId}-slack`} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
            Slack
          </h2>
          {connection ? (
            <Badge tone={isConnected ? 'success' : 'neutral'}>
              {isConnected ? 'Connected' : 'Not connected'}
            </Badge>
          ) : (
            <Badge tone="neutral">Loading…</Badge>
          )}
        </div>

        {isConnected && connection?.team ? (
          <p style={{ margin: 0, color: 'var(--fg-2)' }} data-testid="slack-team">
            Connected to <strong>{connection.team.name}</strong>
            {connection.connectedAt ? ` on ${formatDate(connection.connectedAt)}` : ''}.
          </p>
        ) : (
          <p style={{ margin: 0, color: 'var(--fg-muted)' }}>
            Slack isn't connected for your organization yet.
          </p>
        )}

        {/* Manage controls — admins only; non-admins see them disabled with a reason. */}
        {!isConnected ? (
          canManage ? (
            <div>
              <Button
                type="button"
                variant="primary"
                loading={busy}
                onClick={onConnect}
                data-testid="connect-slack"
              >
                Connect Slack
              </Button>
            </div>
          ) : (
            <Tooltip content={reason('integrations:admin')}>
              <span
                data-testid="connect-reason"
                style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-faint)' }}
              >
                {reason('integrations:admin')}
              </span>
            </Tooltip>
          )
        ) : null}

        {isConnected && canManage ? (
          <>
            <div>
              <label htmlFor={`${formId}-default-project`} style={LABEL}>
                Default project for captured tasks
              </label>
              <Select
                id={`${formId}-default-project`}
                value={connection?.defaultProjectId ?? ''}
                disabled={busy}
                onChange={(e) => onSetDefaultProject(e.target.value)}
              >
                <option value="">No default (use a safe fallback)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Link
                href="/settings/integrations/slack-users"
                style={{ color: 'var(--accent)' }}
                data-testid="manage-slack-users"
              >
                Manage Slack users →
              </Link>
            </div>
            <div>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
                data-testid="disconnect-slack"
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : null}

        {isConnected && !canManage ? (
          <Tooltip content={reason('integrations:admin')}>
            <span
              data-testid="manage-reason"
              style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-faint)' }}
            >
              {reason('integrations:admin')}
            </span>
          </Tooltip>
        ) : null}
      </section>

      <Dialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Slack?"
      >
        <p style={{ marginTop: 0 }}>This stops Slack capture until you reconnect.</p>
        <div style={{ ...ROW, justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
          <Button type="button" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
            Keep connected
          </Button>
          <Button type="button" variant="danger" loading={busy} onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </Dialog>
    </main>
  );
}
