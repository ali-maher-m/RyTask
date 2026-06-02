'use client';

import type { Invitation, InvitationCreated, Membership, Role } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { ApiError, authedRequest } from '../../../lib/api';

/**
 * Members + invitations admin (US8/US3, T108). List members and change their role or remove them;
 * invite teammates by email or by a shareable link, each with a pre-assigned role. The last Owner
 * can't be demoted or removed (the server enforces it; we surface the 409 plainly). Plain language,
 * accessible controls.
 */
const ASSIGNABLE_ROLES: Role[] = ['ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];
const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
  VIEWER: 'Viewer',
};

function listMembers(): Promise<Membership[]> {
  return authedRequest<Membership[]>('/memberships');
}
function listInvites(): Promise<Invitation[]> {
  return authedRequest<Invitation[]>('/invites');
}

export function MembersClient() {
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

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([listMembers(), listInvites()]);
      setMembers(m);
      setInvites(i);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load members.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(userId: string, role: Role) {
    setBusy(true);
    setError(null);
    try {
      await authedRequest<Membership>(`/memberships/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('An organization must always have at least one Owner.');
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
      await authedRequest<void>(`/memberships/${userId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("You can't remove the organization's last Owner.");
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
      const created = await authedRequest<InvitationCreated>('/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: byLink ? null : inviteEmail.trim(),
          role: inviteRole,
          expiresInHours,
        }),
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

  async function revokeInvite(id: string) {
    setBusy(true);
    setError(null);
    try {
      await authedRequest<void>(`/invites/${id}/_revoke`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not revoke the invitation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Members</h1>
        <nav>
          <Link href="/settings/organization">Organization settings</Link>
        </nav>
      </header>

      {error ? (
        <p role="alert" style={{ color: '#b00020' }}>
          {error}
        </p>
      ) : null}

      <h2>Team</h2>
      {!members ? (
        <p>Loading…</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isOwner = m.role === 'OWNER';
              return (
                <tr key={m.userId} data-testid="member-row">
                  <td>{m.user.name}</td>
                  <td>{m.user.email}</td>
                  <td>
                    {isOwner ? (
                      ROLE_LABELS.OWNER
                    ) : (
                      <>
                        <label
                          htmlFor={`role-${m.userId}`}
                          style={{ position: 'absolute', left: '-9999px' }}
                        >
                          Role for {m.user.name}
                        </label>
                        <select
                          id={`role-${m.userId}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void changeRole(m.userId, e.target.value as Role)}
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                  <td>
                    {isOwner ? null : (
                      <button
                        type="button"
                        onClick={() => void remove(m.userId)}
                        disabled={busy}
                        aria-label={`Remove ${m.user.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h2>Invite a teammate</h2>
      <form aria-labelledby={`${formId}-invite-heading`} onSubmit={sendInvite}>
        <h3 id={`${formId}-invite-heading`} style={{ position: 'absolute', left: '-9999px' }}>
          Invite a teammate
        </h3>
        <fieldset>
          <legend>How should they join?</legend>
          <label>
            <input
              type="radio"
              name="invite-method"
              checked={!byLink}
              disabled={busy}
              onChange={() => setByLink(false)}
            />{' '}
            Email an invitation
          </label>
          <br />
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
          <p>
            <label htmlFor={`${formId}-invite-email`}>Their email</label>
            <br />
            <input
              id={`${formId}-invite-email`}
              type="email"
              required={!byLink}
              value={inviteEmail}
              disabled={busy}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </p>
        )}

        <p>
          <label htmlFor={`${formId}-invite-role`}>Role</label>
          <br />
          <select
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
          </select>
        </p>

        <p>
          <label htmlFor={`${formId}-invite-expiry`}>Expires in (hours)</label>
          <br />
          <input
            id={`${formId}-invite-expiry`}
            type="number"
            min={1}
            max={8760}
            value={expiresInHours}
            disabled={busy}
            onChange={(e) => setExpiresInHours(Number(e.target.value) || 168)}
          />
        </p>

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : byLink ? 'Create invite link' : 'Send invitation'}
        </button>
      </form>

      {notice ? <output>{notice}</output> : null}
      {createdLink ? (
        <section
          aria-label="Invite link"
          style={{ border: '1px solid #1a7f37', padding: '0.75rem' }}
        >
          <p>Share this link with your teammate. It joins them at the role you chose.</p>
          <p>
            <code data-testid="invite-link" style={{ wordBreak: 'break-all' }}>
              {createdLink}
            </code>
          </p>
        </section>
      ) : null}

      <h2>Pending invitations</h2>
      {!invites ? (
        <p>Loading…</p>
      ) : invites.length === 0 ? (
        <p>No pending invitations.</p>
      ) : (
        <ul aria-label="Pending invitations" style={{ listStyle: 'none', padding: 0 }}>
          {invites.map((inv) => (
            <li key={inv.id} style={{ borderTop: '1px solid #e3e5e8', padding: '0.5rem 0' }}>
              <span>{inv.email ?? 'Shareable link'}</span> — {ROLE_LABELS[inv.role] ?? inv.role}
              <br />
              <small>Expires {new Date(inv.expiresAt).toLocaleString()}</small>
              <br />
              <button
                type="button"
                onClick={() => void revokeInvite(inv.id)}
                disabled={busy}
                aria-label={`Revoke invitation for ${inv.email ?? 'shareable link'}`}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
