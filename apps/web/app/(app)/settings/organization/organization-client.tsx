'use client';

import { ApiError, authedRequest, clearSession } from '@/lib/api';
import type { Membership, OrgSettings, Organization, Role } from '@rytask/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Organization settings + ownership admin (US8, T108). Owners/Admins edit the org's timezone,
 * locale, week start, working days/hours, logo, and public-signup policy. Owners can additionally
 * transfer ownership to another member or delete the organization (with explicit confirmation).
 * Settings persist via `PATCH /orgs/current` and take effect immediately (e.g. dates re-render in
 * the new timezone).
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEMOTE_ROLES: Role[] = ['ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];

export function OrganizationClient() {
  const router = useRouter();
  const formId = useId();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [settings, setSettings] = useState<OrgSettings>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Transfer / delete state.
  const [transferTo, setTransferTo] = useState('');
  const [demoteSelfTo, setDemoteSelfTo] = useState<Role | ''>('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const load = useCallback(async () => {
    try {
      const current = await authedRequest<Organization>('/orgs/current');
      setOrg(current);
      setSettings(current.settings ?? {});
      try {
        setMembers(await authedRequest<Membership[]>('/memberships'));
      } catch {
        // Listing members may require Owner/Admin; transfer UI just stays empty otherwise.
      }
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load organization settings.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField<K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function toggleWorkingDay(day: number) {
    const current = settings.workingDays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    setField('workingDays', next);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await authedRequest<Organization>('/orgs/current', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setOrg(updated);
      setSettings(updated.settings ?? {});
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !transferTo) return;
    setBusy(true);
    setError(null);
    try {
      await authedRequest<void>('/orgs/current/transfer-ownership', {
        method: 'POST',
        body: JSON.stringify({
          toUserId: transferTo,
          ...(demoteSelfTo ? { demoteSelfTo } : {}),
        }),
      });
      setTransferTo('');
      setDemoteSelfTo('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not transfer ownership.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrg() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authedRequest<void>('/orgs/current', { method: 'DELETE' });
      clearSession();
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the organization.');
      setBusy(false);
    }
  }

  if (!org) {
    return (
      <main>
        <h1>Organization settings</h1>
        {error ? <p role="alert">{error}</p> : <p>Loading…</p>}
      </main>
    );
  }

  const transferable = members.filter((m) => m.role !== 'OWNER' && m.deactivatedAt === null);

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Organization settings</h1>
        <nav>
          <Link href="/settings/members">Members</Link>
        </nav>
      </header>

      <p>
        <strong>{org.name}</strong> <small>({org.slug})</small>
      </p>

      <form aria-labelledby={`${formId}-settings-heading`} onSubmit={save}>
        <h2 id={`${formId}-settings-heading`}>General</h2>

        <p>
          <label htmlFor={`${formId}-timezone`}>Time zone</label>
          <br />
          <input
            id={`${formId}-timezone`}
            type="text"
            value={settings.timezone ?? ''}
            disabled={busy}
            placeholder="e.g. America/New_York"
            onChange={(e) => setField('timezone', e.target.value)}
          />
        </p>

        <p>
          <label htmlFor={`${formId}-locale`}>Language / locale</label>
          <br />
          <input
            id={`${formId}-locale`}
            type="text"
            value={settings.locale ?? ''}
            disabled={busy}
            placeholder="e.g. en-US"
            onChange={(e) => setField('locale', e.target.value)}
          />
        </p>

        <p>
          <label htmlFor={`${formId}-weekstart`}>Week starts on</label>
          <br />
          <select
            id={`${formId}-weekstart`}
            value={settings.weekStart ?? 'MONDAY'}
            disabled={busy}
            onChange={(e) => setField('weekStart', e.target.value as 'SUNDAY' | 'MONDAY')}
          >
            <option value="MONDAY">Monday</option>
            <option value="SUNDAY">Sunday</option>
          </select>
        </p>

        <fieldset>
          <legend>Working days</legend>
          {DAYS.map((label, day) => (
            <label key={label} style={{ marginRight: '0.5rem' }}>
              <input
                type="checkbox"
                checked={(settings.workingDays ?? []).includes(day)}
                disabled={busy}
                onChange={() => toggleWorkingDay(day)}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Working hours</legend>
          <label htmlFor={`${formId}-hours-start`}>Start</label>{' '}
          <input
            id={`${formId}-hours-start`}
            type="time"
            value={settings.workingHours?.start ?? ''}
            disabled={busy}
            onChange={(e) =>
              setField('workingHours', {
                start: e.target.value,
                end: settings.workingHours?.end ?? '',
              })
            }
          />{' '}
          <label htmlFor={`${formId}-hours-end`}>End</label>{' '}
          <input
            id={`${formId}-hours-end`}
            type="time"
            value={settings.workingHours?.end ?? ''}
            disabled={busy}
            onChange={(e) =>
              setField('workingHours', {
                start: settings.workingHours?.start ?? '',
                end: e.target.value,
              })
            }
          />
        </fieldset>

        <p>
          <label htmlFor={`${formId}-logo`}>Logo URL</label>
          <br />
          <input
            id={`${formId}-logo`}
            type="url"
            value={settings.logoUrl ?? ''}
            disabled={busy}
            placeholder="https://…"
            onChange={(e) => setField('logoUrl', e.target.value || null)}
          />
        </p>

        <p>
          <label>
            <input
              type="checkbox"
              checked={settings.allowPublicSignup ?? false}
              disabled={busy}
              onChange={(e) => setField('allowPublicSignup', e.target.checked)}
            />{' '}
            Allow anyone to sign up (otherwise the workspace is invite-only)
          </label>
        </p>

        {error ? (
          <p role="alert" style={{ color: '#b00020' }}>
            {error}
          </p>
        ) : null}
        {saved ? <output>Settings saved.</output> : null}

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <hr />

      <h2>Transfer ownership</h2>
      {transferable.length === 0 ? (
        <p>Add another member first to transfer ownership.</p>
      ) : (
        <form aria-labelledby={`${formId}-transfer-heading`} onSubmit={transfer}>
          <h3 id={`${formId}-transfer-heading`} style={{ position: 'absolute', left: '-9999px' }}>
            Transfer ownership
          </h3>
          <p>
            <label htmlFor={`${formId}-transfer-to`}>New owner</label>
            <br />
            <select
              id={`${formId}-transfer-to`}
              value={transferTo}
              disabled={busy}
              onChange={(e) => setTransferTo(e.target.value)}
            >
              <option value="">Choose a member…</option>
              {transferable.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user.name} ({m.user.email})
                </option>
              ))}
            </select>
          </p>
          <p>
            <label htmlFor={`${formId}-demote`}>Your role afterwards</label>
            <br />
            <select
              id={`${formId}-demote`}
              value={demoteSelfTo}
              disabled={busy}
              onChange={(e) => setDemoteSelfTo(e.target.value as Role | '')}
            >
              <option value="">Stay an Owner</option>
              {DEMOTE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </p>
          <button type="submit" disabled={busy || !transferTo}>
            Transfer ownership
          </button>
        </form>
      )}

      <hr />

      <h2>Delete this organization</h2>
      <p>
        This deactivates the organization and signs everyone out. Type the organization name (
        <strong>{org.name}</strong>) to confirm.
      </p>
      <p>
        <label htmlFor={`${formId}-confirm-delete`}>Confirm name</label>
        <br />
        <input
          id={`${formId}-confirm-delete`}
          type="text"
          value={confirmDelete}
          disabled={busy}
          onChange={(e) => setConfirmDelete(e.target.value)}
        />
      </p>
      <button
        type="button"
        onClick={() => void deleteOrg()}
        disabled={busy || confirmDelete !== org.name}
        style={{ color: '#b00020' }}
      >
        Delete organization
      </button>
    </main>
  );
}
