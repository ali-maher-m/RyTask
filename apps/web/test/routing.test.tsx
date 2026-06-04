import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Auth/setup routing state machine (US1, T032, FR-WEB-002, D18). The cookieless bearer session is
 * invisible to middleware, so gating runs client-side: a signed-in user passes; a brand-new
 * org-less instance routes to /setup; otherwise an unauthenticated hit routes to
 * /login?next=<dest> (same-origin only). RequireAuth renders nothing until the decision resolves.
 */
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  isSignedIn: vi.fn(),
  getSetupState: vi.fn(),
}));

import { RequireAuth } from '@/components/require-auth';
import { getSetupState, isSignedIn } from '@/lib/api';
import { decideProtectedRoute, safeNext } from '@/lib/auth/routing';

const mockedSignedIn = vi.mocked(isSignedIn);
const mockedSetup = vi.mocked(getSetupState);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('decideProtectedRoute', () => {
  it('allows a signed-in user through', async () => {
    mockedSignedIn.mockReturnValue(true);
    await expect(decideProtectedRoute('/my-work')).resolves.toEqual({ kind: 'allow' });
    expect(mockedSetup).not.toHaveBeenCalled();
  });

  it('routes a brand-new org-less instance to /setup', async () => {
    mockedSignedIn.mockReturnValue(false);
    mockedSetup.mockResolvedValue({ available: true });
    await expect(decideProtectedRoute('/my-work')).resolves.toEqual({
      kind: 'redirect',
      to: '/setup',
    });
  });

  it('routes an unauthenticated hit on a completed instance to /login?next=<dest>', async () => {
    mockedSignedIn.mockReturnValue(false);
    mockedSetup.mockResolvedValue({ available: false });
    await expect(decideProtectedRoute('/projects/RY/board')).resolves.toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/projects/RY/board')}`,
    });
  });

  it('falls back to sign-in when the setup probe fails', async () => {
    mockedSignedIn.mockReturnValue(false);
    mockedSetup.mockRejectedValue(new Error('network'));
    await expect(decideProtectedRoute('/inbox')).resolves.toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent('/inbox')}`,
    });
  });
});

describe('safeNext', () => {
  it('keeps a same-origin path', () => {
    expect(safeNext('/projects/RY')).toBe('/projects/RY');
  });

  it('rejects protocol-relative and absolute URLs (no open redirect)', () => {
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('RequireAuth', () => {
  it('renders the protected children once a signed-in user is allowed', async () => {
    mockedSignedIn.mockReturnValue(true);
    render(
      <RequireAuth>
        <p>secret dashboard</p>
      </RequireAuth>,
    );
    expect(await screen.findByText('secret dashboard')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects an org-less instance to /setup and renders nothing', async () => {
    mockedSignedIn.mockReturnValue(false);
    mockedSetup.mockResolvedValue({ available: true });
    render(
      <RequireAuth>
        <p>secret dashboard</p>
      </RequireAuth>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/setup'));
    expect(screen.queryByText('secret dashboard')).toBeNull();
  });
});
