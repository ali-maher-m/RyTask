'use client';

import {
  ApiError,
  createInvite,
  listInvites,
  listMemberships,
  removeMember,
  revokeInvite,
  setMemberRole,
} from '@/lib/api';
import { can, reason } from '@/lib/auth/capabilities';
import { useCapabilities } from '@/lib/auth/capability-context';
import { useOrg } from '@/lib/org/org-context';
import type { Invitation, Membership, Role } from '@rytask/contracts';
import { Avatar, Badge, Button, ForbiddenState, Input, Select, Tooltip } from '@rytask/ui';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Members + invitations admin (US9, T078/T080, FR-WEB-070/072). Lists the org's members and lets an
 * owner/admin change a member's role or remove them, and invite teammates by email or shareable link
 * with a pre-assigned role (revoke pending invites too). Every mutating control is gated by the
 * client capability map (D9) — controls a role can't use are **disabled with a plain reason** in a
 * Tooltip — but the server stays authoritative (Principle VI): a slipped-through write reconciles to
 * the server's `403`/`409` with a kind message. The two hard rules the map encodes here:
 *   • an ADMIN can never change or remove an OWNER;
 *   • no actor can demote or remove the **last** OWNER.
 * Token-only styling; every control is programmatically labelled (axe).
 */

const ASSIGNABLE_ROLES: Role[] = ['ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
  VIEWER: 'Viewer',
};
const ROLE_TONE: Record<Role, 'brand' | 'info' | 'neutral'> = {
  OWNER: 'brand',
  ADMIN: 'info',
  MEMBER: 'neutral',
  GUEST: 'neutral',
  VIEWER: 'neutral',
};

const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '60rem' };
const SECTION: React.CSSProperties = { marginTop: 'var(--space-5)' };
const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-3) var(--space-4)',
};
const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) 0',
  borderTop: '1px solid var(--border-subtle)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};

/** The only OWNER left? Demote/remove must be blocked for that row (mirrors the server `409`). */
function isLastOwnerRow(member: Membership, members: Membership[]): boolean {
  if (member.role !== 'OWNER') return false;
  const owners = members.filter((m) => m.role === 'OWNER' && m.deactivatedAt === null);
  return owners.length <= 1;
}

export interface MembersTableProps {
  members: Membership[];
  /** The signed-in principal's org role — drives the cosmetic gating. */
  currentRole: Role;
  busy?: boolean;
  onChangeRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
}

/**
 * Presentational members table (so it is unit-testable without providers, like `StatusManager`).
 * Gating decisions come from the pure `can`/`reason` map; the reason for a disabled control is shown
 * both in a Tooltip and as visible muted text so it is always discoverable (and assertable in tests).
 */
export function MembersTable({
  members,
  currentRole,
  busy = false,
  onChangeRole,
  onRemove,
}: MembersTableProps) {
  return (
    <ul aria-label="Team members" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {members.map((m) => {
        const lastOwner = isLastOwnerRow(m, members);
        const allowed = can(currentRole, 'members:write', {
          targetRole: m.role,
          isLastOwner: lastOwner,
        });
        const why = allowed
          ? null
          : lastOwner
            ? 'An organization must always have at least one owner.'
            : reason('members:write');

        const roleOptions =
          m.role === 'OWNER' ? (['OWNER', ...ASSIGNABLE_ROLES] as Role[]) : ASSIGNABLE_ROLES;

        return (
          <li key={m.userId} data-testid="member-row" style={ROW}>
            <Avatar name={m.user.name} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 'var(--w-medium)' }}>{m.user.name}</span>
              <span
                style={{
                  display: 'block',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--fg-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {m.user.email}
              </span>
            </span>

            {allowed ? (
              <>
                <span>
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>
                    Role for {m.user.name}
                  </label>
                  <Select
                    id={`role-${m.userId}`}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => onChangeRole(m.userId, e.target.value as Role)}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRemove(m.userId)}
                  aria-label={`Remove ${m.user.name}`}
                  iconStart={<Trash2 size={15} aria-hidden="true" />}
                >
                  Remove
                </Button>
              </>
            ) : (
              <>
                <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Badge>
                <Tooltip content={why}>
                  <span
                    data-testid="member-reason"
                    style={{
                      fontSize: 'var(--fs-sm)',
                      color: 'var(--fg-faint)',
                      maxWidth: '16rem',
                    }}
                  >
                    {why}
                  </span>
                </Tooltip>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function MembersClient() {
  const { role, can: canDo } = useCapabilities();
  const { formatDate } = useOrg();
  const formId = useId();

  const [members, setMembers] = useState<Membership[] | null>(null);
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite form.
  const [byLink, setByLink] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canInvite = canDo('members:invite');

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([
        listMemberships(),
        canInvite ? listInvites() : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvites(i);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load members.');
    }
  }, [canInvite]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(userId: string, role: Role) {
    setBusy(true);
    setError(null);
    try {
      await setMemberRole(userId, { role });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('An organization must always have at least one owner.');
      } else if (e instanceof ApiError && e.status === 403) {
        setError("You don't have permission to change this person's role.");
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not change the role.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await removeMember(userId);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("You can't remove the organization's last owner.");
      } else if (e instanceof ApiError && e.status === 403) {
        setError("You don't have permission to remove this person.");
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not remove the member.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setCreatedLink(null);
    try {
      const created = await createInvite({
        email: byLink ? null : inviteEmail.trim(),
        role: inviteRole,
        expiresInHours,
      });
      if (byLink) {
        setCreatedLink(created.acceptUrl);
      } else {
        setNotice(`Invitation sent to ${inviteEmail.trim()}.`);
        setInviteEmail('');
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      await revokeInvite(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not revoke the invitation.');
    } finally {
      setBusy(false);
    }
  }

  // Cosmetic gate (US5, FR-WEB-100): guests can't see the members surface. The server is still the
  // real control — a guest who reaches this route sees a friendly forbidden, never a member list.
  if (!canDo('members:read')) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Members</h1>
        <ForbiddenState description="Guests can’t see the members list." />
      </main>
    );
  }

  return (
    <main style={MAIN}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Members</h1>
        <nav>
          <Link href="/settings/organization" style={{ color: 'var(--accent)' }}>
            Organization settings
          </Link>
        </nav>
      </header>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-3)' }}>
          {error}
        </p>
      ) : null}

      <section aria-labelledby={`${formId}-team`} style={SECTION}>
        <h2 id={`${formId}-team`} style={{ fontSize: 'var(--fs-h2)' }}>
          Team
        </h2>
        {!members ? (
          <p style={{ color: 'var(--fg-muted)' }}>Loading…</p>
        ) : (
          <div style={CARD}>
            <MembersTable
              members={members}
              currentRole={role}
              busy={busy}
              onChangeRole={changeRole}
              onRemove={remove}
            />
          </div>
        )}
      </section>

      {canInvite ? (
        <section aria-labelledby={`${formId}-invite`} style={SECTION}>
          <h2 id={`${formId}-invite`} style={{ fontSize: 'var(--fs-h2)' }}>
            Invite a teammate
          </h2>
          <form onSubmit={sendInvite} style={{ ...CARD, display: 'grid', gap: 'var(--space-3)' }}>
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend style={LABEL}>How should they join?</legend>
              <label style={{ marginRight: 'var(--space-3)' }}>
                <input
                  type="radio"
                  name="invite-method"
                  checked={!byLink}
                  disabled={busy}
                  onChange={() => setByLink(false)}
                />{' '}
                Email an invitation
              </label>
              <label>
                <input
                  type="radio"
                  name="invite-method"
                  checked={byLink}
                  disabled={busy}
                  onChange={() => setByLink(true)}
                />{' '}
                Create a shareable link
              </label>
            </fieldset>

            {byLink ? null : (
              <Input
                id={`${formId}-invite-email`}
                label="Their email"
                type="email"
                required={!byLink}
                value={inviteEmail}
                disabled={busy}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            )}

            <div>
              <label htmlFor={`${formId}-invite-role`} style={LABEL}>
                Role
              </label>
              <Select
                id={`${formId}-invite-role`}
                value={inviteRole}
                disabled={busy}
                onChange={(e) => setInviteRole(e.target.value as Role)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>

            <Input
              id={`${formId}-invite-expiry`}
              label="Expires in (hours)"
              type="number"
              min={1}
              max={8760}
              value={expiresInHours}
              disabled={busy}
              onChange={(e) => setExpiresInHours(Number(e.target.value) || 168)}
            />

            <div>
              <Button type="submit" variant="primary" loading={busy}>
                {byLink ? 'Create invite link' : 'Send invitation'}
              </Button>
            </div>
          </form>

          {notice ? (
            <output
              style={{ display: 'block', marginTop: 'var(--space-2)', color: 'var(--fg-muted)' }}
            >
              {notice}
            </output>
          ) : null}
          {createdLink ? (
            <section
              aria-label="Invite link"
              style={{ ...CARD, marginTop: 'var(--space-2)', borderColor: 'var(--success)' }}
            >
              <p style={{ marginTop: 0 }}>
                Share this link with your teammate. It joins them at the role you chose.
              </p>
              <code
                data-testid="invite-link"
                style={{
                  fontFamily: 'var(--font-mono)',
                  wordBreak: 'break-all',
                  color: 'var(--fg)',
                }}
              >
                {createdLink}
              </code>
            </section>
          ) : null}

          <h3 style={{ fontSize: 'var(--fs-h3)', marginTop: 'var(--space-4)' }}>
            Pending invitations
          </h3>
          {!invites ? (
            <p style={{ color: 'var(--fg-muted)' }}>Loading…</p>
          ) : invites.length === 0 ? (
            <p style={{ color: 'var(--fg-muted)' }}>No pending invitations.</p>
          ) : (
            <ul
              aria-label="Pending invitations"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {invites.map((inv) => (
                <li key={inv.id} data-testid="invite-row" style={ROW}>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontWeight: 'var(--w-medium)' }}>
                      {inv.email ?? 'Shareable link'}
                    </span>{' '}
                    <Badge tone={ROLE_TONE[inv.role]}>{ROLE_LABELS[inv.role] ?? inv.role}</Badge>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--fg-muted)',
                      }}
                    >
                      Expires {formatDate(inv.expiresAt, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => revoke(inv.id)}
                    aria-label={`Revoke invitation for ${inv.email ?? 'shareable link'}`}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
