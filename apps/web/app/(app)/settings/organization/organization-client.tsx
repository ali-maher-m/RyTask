'use client';

import {
  ApiError,
  clearSession,
  deleteCurrentOrg,
  getCurrentOrg,
  listMemberships,
  transferOwnership,
  updateCurrentOrg,
} from '@/lib/api';
import { useCapabilities } from '@/lib/auth/capability-context';
import type { Membership, OrgSettings, Organization, Role } from '@rytask/contracts';
import { Button, ForbiddenState, Input, Select } from '@rytask/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useState } from 'react';

/**
 * Organization settings + ownership admin (US9, T081, FR-WEB-073). Owners/Admins edit the org's
 * timezone, locale, week start, working days/hours, logo, and public-signup policy; a timezone change
 * **re-renders dates org-wide** (we invalidate the shared `['org','current']` query so `OrgProvider`
 * refetches and every `formatDate`/`formatDay` re-runs). Owners can additionally transfer ownership
 * to another member or delete the organization (with explicit name confirmation). The capability map
 * gates the surface cosmetically; the server's `RbacGuard`/`LastOwnerPolicy` stay authoritative.
 * Token-only styling; every field is programmatically labelled (axe).
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEMOTE_ROLES: Role[] = ['ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];

const MAIN: React.CSSProperties = { padding: 'var(--space-4)', maxWidth: '48rem' };
const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-3)',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--fs-sm)',
  color: 'var(--fg-muted)',
  marginBottom: 'var(--space-1)',
};

export function OrganizationClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useCapabilities();
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
      const current = await getCurrentOrg();
      setOrg(current);
      setSettings(current.settings ?? {});
      try {
        setMembers(await listMemberships());
      } catch {
        // Listing members may require Owner/Admin; the transfer UI just stays empty otherwise.
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
      const updated = await updateCurrentOrg(settings);
      setOrg(updated);
      setSettings(updated.settings ?? {});
      setSaved(true);
      // A timezone/locale change must re-render dates everywhere: refresh the shared org query.
      await queryClient.invalidateQueries({ queryKey: ['org', 'current'] });
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
      await transferOwnership({
        toUserId: transferTo,
        ...(demoteSelfTo ? { demoteSelfTo } : {}),
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
      await deleteCurrentOrg();
      clearSession();
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the organization.');
      setBusy(false);
    }
  }

  // Cosmetic gate (US5, FR-WEB-100): only owners/admins manage org settings. The server stays
  // authoritative — a non-admin who reaches this route sees a friendly forbidden, not the form.
  if (!can('org:settings:write')) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Organization settings</h1>
        <ForbiddenState description="Only owners and admins can change organization settings." />
      </main>
    );
  }

  if (!org) {
    return (
      <main style={MAIN}>
        <h1 style={{ fontSize: 'var(--fs-h1)' }}>Organization settings</h1>
        {error ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : (
          <p style={{ color: 'var(--fg-muted)' }}>Loading…</p>
        )}
      </main>
    );
  }

  const transferable = members.filter((m) => m.role !== 'OWNER' && m.deactivatedAt === null);
  const canTransfer = can('org:transfer');
  const canDelete = can('org:delete');

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
        <h1 style={{ fontSize: 'var(--fs-h1)', margin: 0 }}>Organization settings</h1>
        <nav>
          <Link href="/settings/members" style={{ color: 'var(--accent)' }}>
            Members
          </Link>
        </nav>
      </header>

      <p style={{ marginTop: 'var(--space-2)' }}>
        <strong>{org.name}</strong>{' '}
        <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
          ({org.slug})
        </span>
      </p>

      <form onSubmit={save} aria-labelledby={`${formId}-settings-heading`} style={CARD}>
        <h2 id={`${formId}-settings-heading`} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
          General
        </h2>

        <Input
          id={`${formId}-timezone`}
          label="Time zone"
          type="text"
          value={settings.timezone ?? ''}
          disabled={busy}
          placeholder="e.g. America/New_York"
          onChange={(e) => setField('timezone', e.target.value)}
        />

        <Input
          id={`${formId}-locale`}
          label="Language / locale"
          type="text"
          value={settings.locale ?? ''}
          disabled={busy}
          placeholder="e.g. en-US"
          onChange={(e) => setField('locale', e.target.value)}
        />

        <div>
          <label htmlFor={`${formId}-weekstart`} style={LABEL}>
            Week starts on
          </label>
          <Select
            id={`${formId}-weekstart`}
            value={settings.weekStart ?? 'MONDAY'}
            disabled={busy}
            onChange={(e) => setField('weekStart', e.target.value as 'SUNDAY' | 'MONDAY')}
          >
            <option value="MONDAY">Monday</option>
            <option value="SUNDAY">Sunday</option>
          </Select>
        </div>

        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={LABEL}>Working days</legend>
          {DAYS.map((label, day) => (
            <label key={label} style={{ marginRight: 'var(--space-3)' }}>
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

        <fieldset
          style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: 'var(--space-3)' }}
        >
          <legend style={LABEL}>Working hours</legend>
          <Input
            id={`${formId}-hours-start`}
            label="Start"
            type="time"
            value={settings.workingHours?.start ?? ''}
            disabled={busy}
            onChange={(e) =>
              setField('workingHours', {
                start: e.target.value,
                end: settings.workingHours?.end ?? '',
              })
            }
          />
          <Input
            id={`${formId}-hours-end`}
            label="End"
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

        <Input
          id={`${formId}-logo`}
          label="Logo URL"
          type="url"
          value={settings.logoUrl ?? ''}
          disabled={busy}
          placeholder="https://…"
          onChange={(e) => setField('logoUrl', e.target.value || null)}
        />

        <label>
          <input
            type="checkbox"
            checked={settings.allowPublicSignup ?? false}
            disabled={busy}
            onChange={(e) => setField('allowPublicSignup', e.target.checked)}
          />{' '}
          Allow anyone to sign up (otherwise the workspace is invite-only)
        </label>

        {error ? (
          <p role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}
        {saved ? <output style={{ color: 'var(--fg-muted)' }}>Settings saved.</output> : null}

        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Save settings
          </Button>
        </div>
      </form>

      {canTransfer ? (
        <section
          aria-labelledby={`${formId}-transfer-heading`}
          style={{ marginTop: 'var(--space-5)' }}
        >
          <h2 id={`${formId}-transfer-heading`} style={{ fontSize: 'var(--fs-h2)' }}>
            Transfer ownership
          </h2>
          {transferable.length === 0 ? (
            <p style={{ color: 'var(--fg-muted)' }}>
              Add another member first to transfer ownership.
            </p>
          ) : (
            <form onSubmit={transfer} style={CARD}>
              <div>
                <label htmlFor={`${formId}-transfer-to`} style={LABEL}>
                  New owner
                </label>
                <Select
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
                </Select>
              </div>
              <div>
                <label htmlFor={`${formId}-demote`} style={LABEL}>
                  Your role afterwards
                </label>
                <Select
                  id={`${formId}-demote`}
                  value={demoteSelfTo}
                  disabled={busy}
                  onChange={(e) => setDemoteSelfTo(e.target.value as Role | '')}
                >
                  <option value="">Stay an owner</option>
                  {DEMOTE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Button type="submit" variant="secondary" disabled={busy || !transferTo}>
                  Transfer ownership
                </Button>
              </div>
            </form>
          )}
        </section>
      ) : null}

      {canDelete ? (
        <section style={{ marginTop: 'var(--space-5)' }}>
          <h2 style={{ fontSize: 'var(--fs-h2)', color: 'var(--error)' }}>
            Delete this organization
          </h2>
          <div style={{ ...CARD, borderColor: 'var(--error)' }}>
            <p style={{ margin: 0 }}>
              This deactivates the organization and signs everyone out. Type the organization name (
              <strong>{org.name}</strong>) to confirm.
            </p>
            <Input
              id={`${formId}-confirm-delete`}
              label="Confirm name"
              type="text"
              value={confirmDelete}
              disabled={busy}
              onChange={(e) => setConfirmDelete(e.target.value)}
            />
            <div>
              <Button
                type="button"
                variant="danger"
                onClick={deleteOrg}
                disabled={busy || confirmDelete !== org.name}
              >
                Delete organization
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
