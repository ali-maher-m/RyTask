import type { GithubConnectionDto } from '@rytask/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * GitHub card flow test (M5, AC-11). Admins connect a repository and see the ONE-TIME webhook
 * secret + payload URL; existing connections list with a disconnect control; non-admins get the
 * read-only reason instead of the form. `@/lib/api` + capability/org seams are mocked; the card
 * is driven through its real UI.
 */
const CONNECTION: GithubConnectionDto = {
  id: 'c1',
  repoFullName: 'acme/web',
  connectedAt: '2026-06-11T12:00:00.000Z',
  revokedAt: null,
  webhookPath: '/api/v1/integrations/github/webhook/c1',
};

const { api, caps } = vi.hoisted(() => ({
  api: {
    listGithubConnections: vi.fn(),
    createGithubConnection: vi.fn(),
    deleteGithubConnection: vi.fn(),
  },
  caps: { can: (_perm: string): boolean => true },
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  ...api,
}));
vi.mock('@/lib/api/http', () => ({ API_BASE: 'http://api.test' }));
vi.mock('@/lib/auth/capability-context', () => ({ useCapabilities: () => ({ can: caps.can }) }));
vi.mock('@/lib/org/org-context', () => ({
  useOrg: () => ({ formatDate: (iso: string) => iso.slice(0, 10) }),
}));

import { GithubCard } from '@/app/(app)/settings/integrations/github-card';

beforeEach(() => {
  vi.clearAllMocks();
  caps.can = () => true;
  api.listGithubConnections.mockResolvedValue({ data: [] });
});

describe('GithubCard', () => {
  it('connects a repository and shows the one-time secret + payload URL', async () => {
    api.createGithubConnection.mockResolvedValue({
      data: CONNECTION,
      webhookSecret: 's3cr3t-once',
    });
    render(<GithubCard />);

    fireEvent.change(await screen.findByLabelText(/repository to connect/i), {
      target: { value: 'acme/web' },
    });
    fireEvent.click(screen.getByTestId('connect-github'));

    await waitFor(() =>
      expect(api.createGithubConnection).toHaveBeenCalledWith({ repoFullName: 'acme/web' }),
    );
    const secretBlock = await screen.findByTestId('github-secret');
    expect(secretBlock.textContent).toContain('s3cr3t-once');
    expect(secretBlock.textContent).toContain(
      'http://api.test/api/v1/integrations/github/webhook/c1',
    );
    expect(secretBlock.textContent).toContain('shown only once');
  });

  it('lists an existing connection and disconnects it', async () => {
    api.listGithubConnections.mockResolvedValue({ data: [CONNECTION] });
    api.deleteGithubConnection.mockResolvedValue(undefined);
    render(<GithubCard />);

    const repo = await screen.findByTestId('github-repo');
    expect(repo.textContent).toContain('acme/web');

    fireEvent.click(screen.getByTestId('disconnect-github-acme/web'));
    await waitFor(() => expect(api.deleteGithubConnection).toHaveBeenCalledWith('c1'));
  });

  it('shows the read-only reason instead of the form for non-admins', async () => {
    caps.can = () => false;
    render(<GithubCard />);

    expect(await screen.findByTestId('github-manage-reason')).toBeTruthy();
    expect(screen.queryByTestId('connect-github')).toBeNull();
  });

  it('has no axe violations', async () => {
    api.listGithubConnections.mockResolvedValue({ data: [CONNECTION] });
    const { container } = render(<GithubCard />);
    await screen.findByTestId('github-repo');
    // Color contrast needs computed styles jsdom does not provide; structure/labels/roles are checked.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
