'use client';

import type { Notification, NotificationType } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  ApiError,
  INBOX_STATES,
  type InboxState,
  archive,
  getUnreadCount,
  listNotifications,
  markRead,
  markUnread,
  snooze,
} from './api-client';

/**
 * Notification inbox (US7, T115, FR-NOTIF-002, D10). Reads `GET /api/v1/notifications` for the
 * selected state (unread / all / snoozed / archived) plus `GET /notifications/unread-count` for
 * the badge, and mutates each row via `PATCH /notifications/{id}` (mark read/unread, snooze 1h,
 * archive). Keyset "Load more" advances the cursor (no OFFSET, SC-011). The list is labelled and
 * every interactive control has an accessible name for axe.
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** One hour from now, ISO — the default "snooze" horizon. */
function oneHourFromNow(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

interface InboxData {
  items: Notification[];
  nextCursor: string | null;
}

export function InboxClient() {
  const [state, setState] = useState<InboxState>('unread');
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

  const load = useCallback(async (nextState: InboxState) => {
    try {
      setBusy(true);
      const page = await listNotifications(nextState);
      setData({ items: page.items, nextCursor: page.nextCursor });
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
      setData((prev) =>
        prev ? { items: [...prev.items, ...page.items], nextCursor: page.nextCursor } : prev,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load more');
    } finally {
      setBusy(false);
    }
  }, [data, state, busy]);

  /**
   * Apply a row mutation, then reconcile the local list: in a filtered state (e.g. `unread`) a
   * row that no longer matches drops out; otherwise it is replaced in place. The unread badge is
   * always refreshed.
   */
  const mutate = useCallback(
    async (id: string, fn: () => Promise<Notification>, dropFromCurrent: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await fn();
        setData((prev) => {
          if (!prev) return prev;
          if (dropFromCurrent) {
            return { ...prev, items: prev.items.filter((n) => n.id !== id) };
          }
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
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>
          Inbox{' '}
          {unread !== null ? (
            <span data-testid="unread-badge" aria-label={`${unread} unread notifications`}>
              ({unread})
            </span>
          ) : null}
        </h1>
        <nav>
          <Link href="/">Home</Link>
        </nav>
      </header>

      {/* ── State tabs ─────────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Inbox state" id={tablistId}>
        {INBOX_STATES.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={state === s}
            onClick={() => setState(s)}
            disabled={busy && state === s}
            style={{
              fontWeight: state === s ? 700 : 400,
              marginRight: '0.5rem',
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error ? <p role="alert">{error}</p> : null}

      {!data ? (
        <p>Loading notifications…</p>
      ) : data.items.length === 0 ? (
        <p data-testid="inbox-empty">Nothing here. You are all caught up.</p>
      ) : (
        <ul
          aria-label={`${state} notifications`}
          data-testid="inbox-list"
          style={{ listStyle: 'none', padding: 0 }}
        >
          {data.items.map((n) => (
            <li
              key={n.id}
              data-testid="inbox-row"
              aria-current={isUnread(n) ? 'true' : undefined}
              style={{
                borderTop: '1px solid #e3e5e8',
                padding: '0.5rem 0',
                fontWeight: isUnread(n) ? 600 : 400,
              }}
            >
              <p style={{ margin: 0 }}>
                <span data-testid="inbox-type">{TYPE_LABELS[n.type] ?? n.type}</span>
                {' — '}
                <span>{notificationTitle(n)}</span>
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
                <time dateTime={n.createdAt}>{formatTimestamp(n.createdAt)}</time>
                {n.snoozedUntil ? (
                  <span> · snoozed until {formatTimestamp(n.snoozedUntil)}</span>
                ) : null}
              </p>
              <div>
                {isUnread(n) ? (
                  <button
                    type="button"
                    onClick={() => void mutate(n.id, () => markRead(n.id), state === 'unread')}
                    disabled={busy}
                    aria-label={`Mark notification "${notificationTitle(n)}" as read`}
                  >
                    Mark read
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void mutate(n.id, () => markUnread(n.id), state === 'archived')}
                    disabled={busy}
                    aria-label={`Mark notification "${notificationTitle(n)}" as unread`}
                  >
                    Mark unread
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void mutate(n.id, () => snooze(n.id, oneHourFromNow()), state !== 'snoozed')
                  }
                  disabled={busy}
                  aria-label={`Snooze notification "${notificationTitle(n)}" for one hour`}
                >
                  Snooze 1h
                </button>
                <button
                  type="button"
                  onClick={() => void mutate(n.id, () => archive(n.id), state !== 'archived')}
                  disabled={busy}
                  aria-label={`Archive notification "${notificationTitle(n)}"`}
                >
                  Archive
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.nextCursor ? (
        <p>
          <button type="button" onClick={() => void loadMore()} disabled={busy}>
            {busy ? 'Loading…' : 'Load more'}
          </button>
        </p>
      ) : null}
    </main>
  );
}
