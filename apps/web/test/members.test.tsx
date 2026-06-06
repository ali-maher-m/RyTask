import { MembersTable } from '@/app/(app)/settings/members/members-client';
import { reason } from '@/lib/auth/capabilities';
import type { Membership, Role } from '@rytask/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Members component test (US9, T076, FR-WEB-072, role-capability-matrix §"Rules the map MUST encode").
 * The presentational `MembersTable` mirrors two hard rules of the client capability map:
 *   • an ADMIN can never change or remove an OWNER, and
 *   • no actor (even an OWNER) can demote or remove the **last** OWNER —
 * in both cases the mutating controls are **not actionable** and a plain-language explanation is
 * shown. The server stays authoritative; this is the cosmetic courtesy. `MembersTable` takes its data
 * + callbacks via props, so it is tested without providers (like `StatusManager`).
 */

function member(name: string, role: Role): Membership {
  const id = `u-${name.toLowerCase()}`;
  return {
    userId: id,
    user: { id, email: `${name.toLowerCase()}@rytask.local`, name, emailVerified: true },
    role,
    deactivatedAt: null,
  };
}

/** The `<li data-testid="member-row">` that contains a given member's name. */
function rowFor(name: string): HTMLElement {
  const cell = screen.getByText(name);
  const row = cell.closest('[data-testid="member-row"]');
  if (!row) throw new Error(`no member row for ${name}`);
  return row as HTMLElement;
}

describe('MembersTable — admin-vs-owner rule (an ADMIN cannot act on an OWNER)', () => {
  it('hides role/remove controls for an OWNER row and explains why; an ADMIN row stays actionable', () => {
    // Two owners so the last-owner guard is NOT what disables the owner row here.
    const members = [
      member('Alice Owner', 'OWNER'),
      member('Carol Owner', 'OWNER'),
      member('Bob Admin', 'ADMIN'),
    ];
    render(
      <MembersTable
        members={members}
        currentRole="ADMIN"
        onChangeRole={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    // The OWNER row is not actionable for an admin, with a kind explanation.
    const ownerRow = rowFor('Alice Owner');
    expect(within(ownerRow).queryByLabelText('Role for Alice Owner')).toBeNull();
    expect(within(ownerRow).queryByRole('button', { name: 'Remove Alice Owner' })).toBeNull();
    expect(within(ownerRow).getByTestId('member-reason').textContent).toBe(reason('members:write'));

    // A peer ADMIN row remains fully actionable for an admin.
    const adminRow = rowFor('Bob Admin');
    expect(within(adminRow).getByLabelText('Role for Bob Admin')).toBeTruthy();
    expect(within(adminRow).getByRole('button', { name: 'Remove Bob Admin' })).toBeTruthy();
  });
});

describe('MembersTable — last-owner guard (no one can demote/remove the last OWNER)', () => {
  it('disables the sole-owner controls with an "at least one owner" explanation, even for an OWNER', () => {
    const members = [member('Alice Owner', 'OWNER'), member('Bob Member', 'MEMBER')];
    render(
      <MembersTable
        members={members}
        currentRole="OWNER"
        onChangeRole={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const ownerRow = rowFor('Alice Owner');
    expect(within(ownerRow).queryByLabelText('Role for Alice Owner')).toBeNull();
    expect(within(ownerRow).queryByRole('button', { name: 'Remove Alice Owner' })).toBeNull();
    expect(within(ownerRow).getByTestId('member-reason').textContent).toMatch(
      /at least one owner/i,
    );

    // A non-owner member is fully editable by an owner.
    const memberRow = rowFor('Bob Member');
    expect(within(memberRow).getByLabelText('Role for Bob Member')).toBeTruthy();
    expect(within(memberRow).getByRole('button', { name: 'Remove Bob Member' })).toBeTruthy();
  });

  it('lets an OWNER act on a non-last OWNER (two owners present)', () => {
    const members = [member('Alice Owner', 'OWNER'), member('Carol Owner', 'OWNER')];
    render(
      <MembersTable
        members={members}
        currentRole="OWNER"
        onChangeRole={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // With two owners, neither is the last owner, so an owner can demote the other.
    expect(within(rowFor('Carol Owner')).getByLabelText('Role for Carol Owner')).toBeTruthy();
  });
});

describe('MembersTable — accessibility', () => {
  it('has no accessibility violations', async () => {
    const members = [member('Alice Owner', 'OWNER'), member('Bob Member', 'MEMBER')];
    const { container } = render(
      <MembersTable
        members={members}
        currentRole="OWNER"
        onChangeRole={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    // color-contrast needs canvas/layout jsdom can't provide; it's covered by the e2e axe scan.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
