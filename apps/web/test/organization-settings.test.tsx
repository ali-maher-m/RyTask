import type { Membership, OrgSettings, Organization } from '@rytask/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Organization-settings flow test (US9, T081, FR-WEB-073). Covers the cosmetic capability gate
 * (non-admins see a forbidden state, never the form), loading + saving general settings (which
 * invalidates the shared org query so dates re-render), the save error path, owner-only
 * transfer-ownership, and the name-confirmed delete. `@/lib/api` + the capability/router/query
 * seams are mocked; the client is driven through its real UI.
 */
const ORG: Organization = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  settings: { timezone: 'UTC' },
};
const MEMBERS: Membership[] = [
  {
    userId: 'u-2',
    user: { id: 'u-2', email: 'mate@acme.test', name: 'Mate', emailVerified: true },
    role: 'MEMBER',
    deactivatedAt: null,
  },
];

const { api, caps, routerPush, invalidateQueries } = vi.hoisted(() => ({
  api: {
    getCurrentOrg: vi.fn(),
    listMemberships: vi.fn(),
    updateCurrentOrg: vi.fn(),
    transferOwnership: vi.fn(),
    deleteCurrentOrg: vi.fn(),
    clearSession: vi.fn(),
  },
  caps: { can: (_perm: string) => true },
  routerPush: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
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
vi.mock('@/lib/auth/capability-context', () => ({ useCapabilities: () => ({ can: caps.can }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

import { OrganizationClient } from '@/app/(app)/settings/organization/organization-client';
import { ApiError } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  caps.can = () => true;
  api.getCurrentOrg.mockResolvedValue({ ...ORG, settings: { ...ORG.settings } });
  api.listMemberships.mockResolvedValue(MEMBERS);
  api.updateCurrentOrg.mockImplementation(async (settings: OrgSettings) => ({ ...ORG, settings }));
  api.transferOwnership.mockResolvedValue(undefined);
  api.deleteCurrentOrg.mockResolvedValue(undefined);
});

describe('OrganizationClient', () => {
  it('non-admins see a forbidden state, never the form', () => {
    caps.can = (perm) => perm !== 'org:settings:write';
    render(<OrganizationClient />);
    expect(screen.getByText(/only owners and admins can change/i)).toBeTruthy();
    expect(screen.queryByLabelText('Time zone')).toBeNull();
  });

  it('loads the org, saves edited settings, and invalidates the shared org query', async () => {
    render(<OrganizationClient />);
    const tz = (await screen.findByLabelText('Time zone')) as HTMLInputElement;
    expect(tz.value).toBe('UTC');

    fireEvent.change(tz, { target: { value: 'Europe/Berlin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(api.updateCurrentOrg).toHaveBeenCalledTimes(1));
    expect(api.updateCurrentOrg.mock.calls[0][0]).toMatchObject({ timezone: 'Europe/Berlin' });
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['org', 'current'] });
  });

  it('surfaces a save error', async () => {
    api.updateCurrentOrg.mockRejectedValueOnce(new ApiError(400, 'Bad timezone'));
    render(<OrganizationClient />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Bad timezone');
  });

  it('transfers ownership to a chosen member', async () => {
    render(<OrganizationClient />);
    const select = (await screen.findByLabelText('New owner')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'u-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await waitFor(() => expect(api.transferOwnership).toHaveBeenCalledTimes(1));
    expect(api.transferOwnership.mock.calls[0][0]).toMatchObject({ toUserId: 'u-2' });
  });

  it('gates delete behind typing the org name, then deletes + signs out', async () => {
    render(<OrganizationClient />);
    const confirm = (await screen.findByLabelText('Confirm name')) as HTMLInputElement;
    const deleteBtn = screen.getByRole('button', { name: 'Delete organization' });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(confirm, { target: { value: 'Acme' } });
    expect((deleteBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(deleteBtn);
    await waitFor(() => expect(api.deleteCurrentOrg).toHaveBeenCalledTimes(1));
    expect(api.clearSession).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/login');
  });
});
