'use client';

import type {
  AcceptInvite,
  AcceptInviteResult,
  AuthResult,
  BootstrapRequest,
  ConfirmPasswordResetRequest,
  InvitePreview,
  LoginRequest,
  RegisterRequest,
  RequestPasswordResetRequest,
  SetupState,
  VerifyEmailRequest,
  WhoAmI,
} from '@rytask/contracts';

/**
 * Shared browser API client for the M0 identity / onboarding surface (US1–US8). Unlike the M1
 * dev-header seam (`x-user-id` …), M0 authenticates with a real bearer token: the short-lived
 * access token is attached to every authed request and **silently refreshed** once on a 401 via
 * `POST /auth/refresh` (FR-AUTH-002, SC-003). Tokens are persisted in `localStorage` so a reload
 * keeps the session; the plaintext is only ever held client-side (never in a URL — SC-002).
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const ACCESS_KEY = 'rytask.accessToken';
const REFRESH_KEY = 'rytask.refreshToken';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function storeSession(result: AuthResult): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_KEY, result.accessToken);
  window.localStorage.setItem(REFRESH_KEY, result.refreshToken);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export function isSignedIn(): boolean {
  return getAccessToken() !== null;
}

async function parse<T>(res: Response, method: string, path: string): Promise<T> {
  if (!res.ok) {
    let message = `${method} ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body?.message === 'string') {
        message = body.message;
      } else if (Array.isArray(body?.message)) {
        message = body.message.join(', ');
      }
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Unauthenticated call — login, register, setup, invite preview/accept, password reset, verify. */
export async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  return parse<T>(res, init?.method ?? 'GET', path);
}

// A single in-flight refresh is shared across concurrent 401s (avoid a refresh stampede).
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = (async (): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          clearSession();
          return false;
        }
        storeSession((await res.json()) as AuthResult);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/**
 * Authenticated `fetch` returning the raw `Response` — attaches the bearer token and silently
 * refreshes once on a 401. Use this when the caller must branch on the status itself (e.g. a 409
 * optimistic-concurrency conflict, or a 204 no-content); otherwise prefer {@link authedRequest},
 * which parses JSON and throws {@link ApiError} on a non-2xx. `path` is relative to `/api/v1`.
 */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const send = async (): Promise<Response> => {
    const token = getAccessToken();
    return fetch(`${API_BASE}/api/v1${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  };

  let res = await send();
  if (res.status === 401 && (await tryRefresh())) {
    res = await send();
  }
  return res;
}

/** Authenticated call — attaches the bearer token, silently refreshes once on a 401, parses JSON. */
export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(path, init);
  return parse<T>(res, init?.method ?? 'GET', path);
}

// ──────────────────────────────────────────────────────── auth / onboarding endpoints

/** GET /setup — is first-run onboarding still available? (closed once an org exists). */
export function getSetupState(): Promise<SetupState> {
  return publicRequest<SetupState>('/setup');
}

/** POST /setup — first-run bootstrap (org + owner + workspace + starter project) → signed in. */
export function bootstrap(body: BootstrapRequest): Promise<AuthResult> {
  return publicRequest<AuthResult>('/setup', { method: 'POST', body: JSON.stringify(body) });
}

/** POST /auth/login — email + password → access + refresh. */
export function login(body: LoginRequest): Promise<AuthResult> {
  return publicRequest<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

/** POST /auth/register — self-registration (only when the org allows public signup). */
export function register(body: RegisterRequest): Promise<AuthResult> {
  return publicRequest<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** GET /auth/whoami — the resolved principal for the current session. */
export function whoami(): Promise<WhoAmI> {
  return authedRequest<WhoAmI>('/auth/whoami');
}

/** POST /auth/logout — revoke the current session, then drop the local tokens. */
export async function logout(): Promise<void> {
  try {
    await authedRequest<void>('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
  }
}

/** POST /auth/request-password-reset — uniform response (no account enumeration, SC-010). */
export function requestPasswordReset(body: RequestPasswordResetRequest): Promise<void> {
  return publicRequest<void>('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /auth/confirm-password-reset — consume the emailed token + set a new password. */
export function confirmPasswordReset(body: ConfirmPasswordResetRequest): Promise<void> {
  return publicRequest<void>('/auth/confirm-password-reset', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** POST /auth/verify-email — consume an email-verification token. */
export function verifyEmail(body: VerifyEmailRequest): Promise<void> {
  return publicRequest<void>('/auth/verify-email', { method: 'POST', body: JSON.stringify(body) });
}

/** GET /invites/{token} — public preview of an invite (org + role) before accepting. */
export function getInvitePreview(token: string): Promise<InvitePreview> {
  return publicRequest<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
}

/** POST /invites/{token}/accept — join at the pre-assigned role → signed in. */
export function acceptInvite(token: string, body: AcceptInvite): Promise<AcceptInviteResult> {
  return publicRequest<AcceptInviteResult>(`/invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
