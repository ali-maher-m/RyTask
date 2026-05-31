'use client';

import type {
  Notification,
  NotificationEnvelope,
  NotificationListResponse,
  UnreadCountResponse,
  UpdateNotification,
} from '@rytask/contracts';

/**
 * Browser API client for the notification inbox (US7, T115, FR-NOTIF-002, D10). The
 * hand-written `@rytask/sdk` only covers health today, so this calls `/api/v1` with `fetch`,
 * mirroring `app/my-work/api-client.ts`. The dev principal is still resolved from headers in M1
 * (apps/api `resolveDevPrincipal`). Routes (contracts/openapi.yaml, under /api/v1):
 *   GET   /notifications?state=        — inbox, keyset-paginated `{ data, pageInfo }`
 *   GET   /notifications/unread-count  — badge count `{ data: { count } }`
 *   PATCH /notifications/{id}          — mark read/unread, snooze, or archive
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Dev principal headers (M1 seam — apps/api/src/common/auth/principal.ts). */
const SEED_USER_ID = '0193b3a0-0000-7000-8000-000000000003';
const SEED_ORG_ID = '0193b3a0-0000-7000-8000-000000000001';
const SEED_WORKSPACE_ID = '0193b3a0-0000-7000-8000-000000000002';

function principalHeaders(): Record<string, string> {
  return {
    'x-user-id': process.env.NEXT_PUBLIC_DEV_USER_ID ?? SEED_USER_ID,
    'x-organization-id': process.env.NEXT_PUBLIC_DEV_ORG_ID ?? SEED_ORG_ID,
    'x-workspace-id': process.env.NEXT_PUBLIC_DEV_WORKSPACE_ID ?? SEED_WORKSPACE_ID,
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...principalHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${init?.method ?? 'GET'} ${path} failed (${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** The four selectable inbox states (matches `NOTIFICATION_STATES` in the contract). */
export const INBOX_STATES = ['unread', 'all', 'snoozed', 'archived'] as const;
export type InboxState = (typeof INBOX_STATES)[number];

/** One keyset page of the inbox. */
export interface InboxPage {
  items: Notification[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/** Read one keyset page of the inbox for a given state (`GET /notifications?state=`). */
export async function listNotifications(
  state: InboxState,
  cursor?: string | null,
  limit = 50,
): Promise<InboxPage> {
  const params = new URLSearchParams({ state, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const page = await request<NotificationListResponse>(`/notifications?${params.toString()}`);
  return {
    items: page.data,
    nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : null,
    hasNextPage: page.pageInfo.hasNextPage,
  };
}

/** Read the unread-count badge (`GET /notifications/unread-count`). */
export async function getUnreadCount(): Promise<number> {
  const body = await request<UnreadCountResponse>('/notifications/unread-count');
  return body.data.count;
}

/**
 * Update one notification — mark read/unread, snooze (re-surfaces after the timestamp), or
 * archive (`PATCH /notifications/{id}`). Returns the updated notification.
 */
export async function updateNotification(
  id: string,
  patch: UpdateNotification,
): Promise<Notification> {
  const body = await request<NotificationEnvelope>(`/notifications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return body.data;
}

/** Mark a notification read (`read: true`). */
export function markRead(id: string): Promise<Notification> {
  return updateNotification(id, { read: true });
}

/** Mark a notification unread (`read: false`). */
export function markUnread(id: string): Promise<Notification> {
  return updateNotification(id, { read: false });
}

/** Snooze a notification until an ISO timestamp; pass `null` to clear the snooze. */
export function snooze(id: string, snoozedUntil: string | null): Promise<Notification> {
  return updateNotification(id, { snoozedUntil });
}

/** Archive a notification (`archived: true`). */
export function archive(id: string): Promise<Notification> {
  return updateNotification(id, { archived: true });
}
