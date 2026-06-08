'use client';

import {
  ApiError,
  getSlackConnection,
  listMemberships,
  listSlackUsers,
  mapSlackUser,
  unmapSlackUser,
} from '@/lib/api';
import { reason } from '@/lib/auth/capabilities';
import { useCapabilities } from '@/lib/auth/capability-context';
import type { Membership, SlackConnectionDto, SlackUserMappingDto } from '@rytask/contracts';
import { Badge, EmptyState, ForbiddenState, Select } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * Slack ↔ RyTask user mapping (US5, FR-WEB-102, web-surfaces.md §3.B). Admins see every Slack
 * user the connection discovered, with a member `Select` to link the right teammate; rows show
 * an auto/manual `Badge` and unmapped rows are highlighted as "needs linking" — capture is never
 * blocked on a missing link (the captor is simply prompted in Slack). The server is authoritative
 * (admin-gated, tenant-scoped); this page hides the controls cosmetically for non-admins. The
 * `Select` only ever offers org members, so a link can never point outside the org. Token-only.
 */
const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '52rem' };
const TABLE: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const CELL: React.CSSProperties = {
  padding: 'var(--space-2)',
  textAlign: 'left',
  verticalAlign: 'middle',
  borderTop: '1px solid var(--border-subtle)',
};
const HEAD: React.CSSProperties = {
  ...CELL,
  borderTop: 'none',
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--fg-muted)',
  fontWeight: 'var(--w-medium)',
};
const MUTED: React.CSSProperties = { color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' };
/** Unmapped rows are gently highlighted so admins can see who still needs linking. */
const NEEDS_LINK_ROW: React.CSSProperties = { background: 'var(--warning-soft)' };

/** The current mapping state of a row, for the badge + highlight. */
function mappingBadge(row: SlackUserMappingDto): React.ReactNode {
  if (!row.mappedUserId) {
    return <Badge tone="warning">Needs linking</Badge>;
  }
  return row.mappedManually ? (
    <Badge tone="info">Linked manually</Badge>
  ) : (
    <Badge tone="success">Auto-linked</Badge>
  );
}

export function SlackUsersClient() {
  const { can } = useCapabilities();
  const canManage = can('integrations:admin');

  const [connection, setConnection] = useState<SlackConnectionDto | null>(null);
  const [rows, setRows] = useState<SlackUserMappingDto[] | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const conn = await getSlackConnection();
      setConnection(conn);
      if (conn.status !== 'connected') {
        setRows([]);
        return;
      }
      const [users, memberships] = await Promise.all([listSlackUsers(), listMemberships()]);
      setRows(users);
      setMembers(memberships.filter((m) => !m.deactivatedAt));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load Slack users.');
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  const onChangeMapping = useCallback(async (slackUserId: string, userId: string) => {
    setBusyId(slackUserId);
    setError(null);
    try {
      if (userId) {
        const updated = await mapSlackUser(slackUserId, userId);
        setRows((prev) =>
          prev ? prev.map((r) => (r.slackUserId === slackUserId ? updated : r)) : prev,
        );
      } else {
        await unmapSlackUser(slackUserId);
        // Unlink keeps the Slack identity but clears the link (back to "needs linking").
        setRows((prev) =>
          prev
            ? prev.map((r) =>
                r.slackUserId === slackUserId
                  ? { ...r, mappedUserId: null, mappedManually: false }
                  : r,
              )
            : prev,
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update the mapping.');
    } finally {
      setBusyId(null);
    }
  }, []);

  if (!canManage) {
    return (
      <main style={MAIN}>
        <ForbiddenState title="Admins only" description={reason('integrations:admin')} />
      </main>
    );
  }

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
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Slack users</h1>
        <nav>
          <Link href="/settings/integrations" style={{ color: 'var(--accent)' }}>
            Back to integrations
          </Link>
        </nav>
      </header>
      <p style={MUTED}>
        Link each Slack user to the right teammate so tasks captured from Slack are attributed
        correctly. Capture still works for unlinked users — they’re just prompted to link.
      </p>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-2)' }}>
          {error}
        </p>
      ) : null}

      {rows === null ? (
        <p style={MUTED}>Loading…</p>
      ) : connection?.status !== 'connected' ? (
        <EmptyState
          title="Slack isn’t connected"
          description="Connect a Slack workspace first, then map its users here."
          action={
            <Link href="/settings/integrations" style={{ color: 'var(--accent)' }}>
              Go to integrations
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No Slack users found yet"
          description="We didn’t find any users in this Slack workspace to map."
        />
      ) : (
        <table style={TABLE} data-testid="slack-users-table">
          <thead>
            <tr>
              <th scope="col" style={HEAD}>
                Slack user
              </th>
              <th scope="col" style={HEAD}>
                Status
              </th>
              <th scope="col" style={HEAD}>
                Linked teammate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const unmapped = !row.mappedUserId;
              return (
                <tr
                  key={row.slackUserId}
                  data-testid="slack-user-row"
                  data-unmapped={unmapped ? 'true' : 'false'}
                  style={unmapped ? NEEDS_LINK_ROW : undefined}
                >
                  <td style={CELL}>
                    <span style={{ fontWeight: 'var(--w-medium)' }}>
                      {row.slackUserName ?? row.slackUserId}
                    </span>
                    {row.slackUserEmail ? (
                      <span style={{ display: 'block', ...MUTED }}>{row.slackUserEmail}</span>
                    ) : null}
                  </td>
                  <td style={CELL}>{mappingBadge(row)}</td>
                  <td style={CELL}>
                    <label className="sr-only" htmlFor={`map-${row.slackUserId}`}>
                      Linked teammate for {row.slackUserName ?? row.slackUserId}
                    </label>
                    <Select
                      id={`map-${row.slackUserId}`}
                      value={row.mappedUserId ?? ''}
                      disabled={busyId === row.slackUserId}
                      onChange={(e) => void onChangeMapping(row.slackUserId, e.target.value)}
                    >
                      <option value="">Not linked</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.name} ({m.user.email})
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
