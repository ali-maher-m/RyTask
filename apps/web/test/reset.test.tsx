import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Password-reset component test (US12, T091, FR-WEB-013). Two security-critical behaviors:
 *   1. No enumeration — requesting a reset shows the SAME confirmation whether or not the email
 *      exists; the client never branches on account existence.
 *   2. A used or expired reset link is rejected with a plain "no longer valid" message and a path
 *      to request a new one (single-use / expiry honored).
 * The consolidated `@/lib/api` is mocked; the real forms are driven through their UI.
 */

const { requestPasswordReset, confirmPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  },
  requestPasswordReset,
  confirmPasswordReset,
}));

import { ResetConfirmClient } from '@/app/(auth)/reset/confirm/confirm-client';
import { ResetRequestClient } from '@/app/(auth)/reset/reset-client';
import { ApiError } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

/** The success confirmation paragraph (the one that names the reset email), as plain text. */
function confirmationText(): string {
  const el = screen.getByText(
    (_, node) =>
      node?.tagName === 'P' && /sent a link to reset your password/i.test(node.textContent ?? ''),
  );
  return el.textContent ?? '';
}

describe('ResetRequestClient — no enumeration', () => {
  it('shows the identical confirmation for a known and an unknown email', async () => {
    requestPasswordReset.mockResolvedValue(undefined);

    // A "known" address.
    const { unmount } = render(<ResetRequestClient />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'known@rytask.local' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByRole('heading', { name: /check your email/i });
    const knownText = confirmationText().replace('known@rytask.local', '<email>');
    unmount();

    // An address that doesn't exist — same component path, same wording.
    render(<ResetRequestClient />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@rytask.local' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    await screen.findByRole('heading', { name: /check your email/i });
    const unknownText = confirmationText().replace('nobody@rytask.local', '<email>');

    // Identical wording (only the echoed address differs) — the page reveals nothing.
    expect(knownText).toBe(unknownText);
    // And the request is made identically in both cases (no client-side branch on existence).
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'known@rytask.local' });
    expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'nobody@rytask.local' });
  });
});

describe('ResetConfirmClient — used/expired link', () => {
  it('rejects an expired link with a plain "no longer valid" message + a re-request path', async () => {
    window.history.replaceState({}, '', '/reset/confirm?token=expired-or-used');
    confirmPasswordReset.mockRejectedValueOnce(new ApiError(400, 'token invalid'));

    render(<ResetConfirmClient />);

    const password = await screen.findByLabelText('New password');
    fireEvent.change(password, { target: { value: 'a-brand-new-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/no longer valid/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeTruthy();
    expect(confirmPasswordReset).toHaveBeenCalledWith({
      token: 'expired-or-used',
      newPassword: 'a-brand-new-passphrase',
    });
  });

  it('confirms a valid link and routes to sign-in', async () => {
    window.history.replaceState({}, '', '/reset/confirm?token=fresh');
    confirmPasswordReset.mockResolvedValueOnce(undefined);

    render(<ResetConfirmClient />);

    const password = await screen.findByLabelText('New password');
    fireEvent.change(password, { target: { value: 'a-brand-new-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeTruthy();
  });
});
