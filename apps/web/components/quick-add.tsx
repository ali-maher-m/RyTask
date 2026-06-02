'use client';

import { useState } from 'react';
import { authedFetch } from '../lib/api';

/**
 * Quick-add input (US1, FR-WI-004). One line with inline tokens `@assignee #label
 * !priority ^date`; on submit it POSTs to /work-items and surfaces any `meta.unresolved`
 * tokens as a correction affordance (tokens are never silently dropped — SC-002). The request
 * carries the M0 bearer token via `authedFetch` (the M1 dev-header seam is gone).
 */

interface UnresolvedToken {
  token: string;
  kind: 'assignee' | 'label' | 'priority' | 'date';
}

interface CreatedWorkItem {
  key: string;
  title: string;
}

export function QuickAdd({ projectId }: { projectId: string }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedWorkItem | null>(null);
  const [unresolved, setUnresolved] = useState<UnresolvedToken[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/work-items', {
        method: 'POST',
        body: JSON.stringify({ projectId, quickAdd: value.trim() }),
      });
      if (!res.ok) {
        setError(`Capture failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        data: CreatedWorkItem;
        meta: { unresolved: UnresolvedToken[] };
      };
      setCreated(body.data);
      setUnresolved(body.meta?.unresolved ?? []);
      setValue('');
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Quick add work item">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Capture a task…  @assignee #label !priority ^date"
        aria-label="Quick add"
        disabled={busy}
      />
      <button type="submit" disabled={busy || !value.trim()}>
        Add
      </button>
      <p>
        <small>
          Tokens: @assignee · #label · !urgent|high|medium|low · ^today|tomorrow|2026-07-04
        </small>
      </p>
      {created ? (
        <output>
          Created <strong>{created.key}</strong> — {created.title}
        </output>
      ) : null}
      {unresolved.length > 0 ? (
        <ul aria-label="Unresolved tokens">
          {unresolved.map((u) => (
            <li key={`${u.kind}:${u.token}`}>
              Couldn’t resolve {u.kind} <code>{u.token}</code> — please fix it on the item.
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
