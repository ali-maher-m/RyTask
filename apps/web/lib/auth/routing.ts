'use client';

import { getSetupState, isSignedIn } from '../api';

/**
 * Client auth/setup routing state machine (D18, FR-WEB-002). The session is a cookieless
 * `localStorage` bearer (invisible to Next middleware), so gating runs client-side:
 *
 *   visit a protected route
 *     ├─ signed in                                  → allow
 *     ├─ instance has no org (GET /setup → open)    → /setup           (never re-offered once closed)
 *     └─ otherwise                                  → /login?next=<dest> (return after sign-in)
 *
 * A completed instance never re-offers setup (the setup endpoint reports `available: false`, and
 * the wizard self-closes). `safeNext` keeps the post-login return strictly same-origin.
 */
export type AuthDecision = { kind: 'allow' } | { kind: 'redirect'; to: string };

export async function decideProtectedRoute(destination: string): Promise<AuthDecision> {
  if (isSignedIn()) return { kind: 'allow' };
  try {
    const state = await getSetupState();
    if (state.available) return { kind: 'redirect', to: '/setup' };
  } catch {
    // If the setup probe fails, fall back to sign-in (the safe default).
  }
  return { kind: 'redirect', to: `/login?next=${encodeURIComponent(destination)}` };
}

/** Restrict a `?next=` value to a same-origin path (`/…`, not `//…` or absolute) — no open redirect. */
export function safeNext(raw: string | null | undefined): string {
  return raw?.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}
