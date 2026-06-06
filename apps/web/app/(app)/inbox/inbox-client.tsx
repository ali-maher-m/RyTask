'use client';

import {
  ApiError,
  type InboxStateFilter,
  getUnreadCount,
  listNotifications,
  updateNotification,
} from '@/lib/api';
import { useOrg } from '@/lib/org/org-context';
import { NOTIFICATION_STATES, type Notification, type NotificationType } from '@rytask/contracts';
import { Badge, Button, EmptyState } from '@rytask/ui';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Notification inbox (US10, T086, FR-WEB-082, D10). Reads `GET /notifications?state=` for the selected
 * state (unread / all / snoozed / archived) plus `GET /notifications/unread-count` for the badge, and
 * mutates each row via `PATCH /notifications/{id}` — mark read/unread, snooze 1h (re-surfaces),
 * archive (hides). Each mutation reconciles the local list (a row that no longer matches the current
 * filter drops out) and refreshes the unread count. Keyset "Load more" advances the cursor (no OFFSET,
 * SC-011). Dates render in the org timezone/locale (FR-WEB-004). Token-only; every control is labelled.
 */

const TYPE_LABELS: Record<NotificationType, string> = {
  ASSIGNED: 'Assigned to you',
  MENTIONED: 'You were mentioned',
  COMMENTED: 'New comment',
  STATUS_CHANGED: 'Status changed',
  DUE_SOON: 'Due soon',
  OVERDUE: 'Overdue',
};

/** Human title for a notification, preferring the payload `title` when the server supplies one. */
function notificationTitle(n: Notification): string {
  const payloadTitle = typeof n.payload?.title === 'string' ? (n.payload.title as string) : null;
  return payloadTitle ?? `${TYPE_LABELS[n.type] ?? n.type} · ${n.entityType} ${n.entityId}`;
}

/** One hour from now, ISO — the default "snooze" horizon. */
function oneHourFromNow(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

interface InboxData {
  items: Notification[];
  nextCursor: string | null;
}

const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '52rem' };
const TAB_BASE: React.CSSProperties = {
  font: 'inherit',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
};

export function InboxClient() {
  const { formatDate } = useOrg();
  const [state, setState] = useState<InboxStateFilter>('unread');
  const [data, setData] = useState<InboxData | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tablistId = useId();

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await getUnreadCount());
    } catch {
      // The badge is non-critical; leave the last value on a transient failure.
    }
  }, []);

  const load = useCallback(async (nextState: InboxStateFilter) => {
    try {
      setBusy(true);
      const page = await listNotifications(nextState);
      setData({
        items: page.data,
        nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load notifications');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(state);
    void refreshCount();
  }, [state, load, refreshCount]);

  const loadMore = useCallback(async () => {
    if (!data?.nextCursor || busy) return;
    try {
      setBusy(true);
      const page = await listNotifications(state, data.nextCursor);
      const nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null;
      setData((prev) => (prev ? { items: [...prev.items, ...page.data], nextCursor } : prev));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load more');
    } finally {
      setBusy(false);
    }
  }, [data, state, busy]);

  /**
   * Apply a row mutation, then reconcile the local list: in a filtered state (e.g. `unread`) a row
   * that no longer matches drops out; otherwise it is replaced in place. The unread badge is always
   * refreshed so it stays in step with the row's new read state.
   */
  const mutate = useCallback(
    async (id: string, fn: () => Promise<Notification>, dropFromCurrent: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await fn();
        setData((prev) => {
          if (!prev) return prev;
          if (dropFromCurrent) return { ...prev, items: prev.items.filter((n) => n.id !== id) };
          return { ...prev, items: prev.items.map((n) => (n.id === id ? updated : n)) };
        });
        await refreshCount();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Update failed');
      } finally {
        setBusy(false);
      }
    },
    [refreshCount],
  );

  function isUnread(n: Notification): boolean {
    return n.readAt === null;
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
        <h1
          style={{
            fontSize: 'var(--fs-h1)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          Inbox{' '}
          {unread !== null ? (
            <span data-testid="unread-badge" aria-label={`${unread} unread notifications`}>
              <Badge tone={unread > 0 ? 'brand' : 'neutral'}>{unread}</Badge>
            </span>
          ) : null}
        </h1>
        <nav>
          <Link href="/" style={{ color: 'var(--accent)' }}>
            Home
          </Link>
        </nav>
      </header>

      <div
        role="tablist"
        aria-label="Inbox state"
        id={tablistId}
        style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}
      >
        {NOTIFICATION_STATES.map((s) => {
          const selected = state === s;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setState(s)}
              disabled={busy && selected}
              style={{
                ...TAB_BASE,
                background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                color: selected ? 'var(--accent)' : 'var(--fg-muted)',
                borderColor: selected ? 'var(--accent)' : 'var(--border)',
                fontWeight: selected ? 'var(--w-medium)' : 'var(--w-regular)',
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-3)' }}>
          {error}
        </p>
      ) : null}

      {!data ? (
        <p style={{ color: 'var(--fg-muted)', marginTop: 'var(--space-3)' }}>
          Loading notifications…
        </p>
      ) : data.items.length === 0 ? (
        <div data-testid="inbox-empty" style={{ marginTop: 'var(--space-4)' }}>
          <EmptyState
            title="You're all caught up"
            description="New notifications will show up here."
          />
        </div>
      ) : (
        <ul
          aria-label={`${state} notifications`}
          data-testid="inbox-list"
          style={{ listStyle: 'none', margin: 'var(--space-3) 0 0', padding: 0 }}
        >
          {data.items.map((n) => (
            <li
              key={n.id}
              data-testid="inbox-row"
              aria-current={isUnread(n) ? 'true' : undefined}
              style={{
                borderTop: '1px solid var(--border-subtle)',
                padding: 'var(--space-3) 0',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontWeight: isUnread(n) ? 'var(--w-medium)' : 'var(--w-regular)',
                }}
              >
                <span data-testid="inbox-type">{TYPE_LABELS[n.type] ?? n.type}</span>
                {' — '}
                <span>{notificationTitle(n)}</span>
              </p>
              <p
                style={{
                  margin: 'var(--space-1) 0',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--fg-muted)',
                }}
              >
                <time dateTime={n.createdAt} style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatDate(n.createdAt, { hour: '2-digit', minute: '2-digit' })}
                </time>
                {n.snoozedUntil ? (
                  <span>
                    {' · snoozed until '}
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {formatDate(n.snoozedUntil, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                ) : null}
              </p>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {isUnread(n) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        n.id,
                        () => updateNotification(n.id, { read: true }),
                        state === 'unread',
                      )
                    }
                    aria-label={`Mark notification "${notificationTitle(n)}" as read`}
                  >
                    Mark read
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void mutate(
                        n.id,
                        () => updateNotification(n.id, { read: false }),
                        state === 'archived',
                      )
                    }
                    aria-label={`Mark notification "${notificationTitle(n)}" as unread`}
                  >
                    Mark unread
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      n.id,
                      () => updateNotification(n.id, { snoozedUntil: oneHourFromNow() }),
                      state !== 'snoozed',
                    )
                  }
                  aria-label={`Snooze notification "${notificationTitle(n)}" for one hour`}
                >
                  Snooze 1h
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      n.id,
                      () => updateNotification(n.id, { archived: true }),
                      state !== 'archived',
                    )
                  }
                  aria-label={`Archive notification "${notificationTitle(n)}"`}
                >
                  Archive
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.nextCursor ? (
        <p style={{ marginTop: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={() => void loadMore()} loading={busy}>
            Load more
          </Button>
        </p>
      ) : null}
    </main>
  );
}
