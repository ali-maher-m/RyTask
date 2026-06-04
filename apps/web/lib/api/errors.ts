'use client';

import { ApiError } from './http';

/**
 * Tenant-safe error mapping (D10, FR-WEB-101). Translates an API failure into a UI surface kind
 * without ever rendering foreign data: a `404` (existence is never leaked across tenants) and a
 * `403` map to friendly not-found / forbidden states; a `409` is an optimistic-concurrency
 * conflict the caller reconciles (refresh, don't overwrite — D15); everything else is a generic,
 * recoverable error. Human-key deep links resolve through the API, so a cross-tenant id simply
 * yields `not-found` here — zero foreign rows reach the view.
 */
export type SurfaceKind = 'not-found' | 'forbidden' | 'conflict' | 'unauthorized' | 'error';

export interface MappedError {
  kind: SurfaceKind;
  status: number | null;
  /** A kind, plain-language message safe to show a non-technical teammate. */
  message: string;
}

const MESSAGES: Record<SurfaceKind, string> = {
  'not-found': 'We couldn’t find that. It may have been moved or removed.',
  forbidden: 'You don’t have access to this.',
  conflict: 'Someone else changed this while you were editing. Refresh to see the latest.',
  unauthorized: 'Your session has ended. Please sign in again.',
  error: 'Something went wrong. Please try again.',
};

export function mapApiError(err: unknown): MappedError {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return { kind: 'unauthorized', status: 401, message: MESSAGES.unauthorized };
      case 403:
        return { kind: 'forbidden', status: 403, message: MESSAGES.forbidden };
      case 404:
        return { kind: 'not-found', status: 404, message: MESSAGES['not-found'] };
      case 409:
        return { kind: 'conflict', status: 409, message: MESSAGES.conflict };
      default:
        return { kind: 'error', status: err.status, message: MESSAGES.error };
    }
  }
  return { kind: 'error', status: null, message: MESSAGES.error };
}

export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}
