'use client';

import { PRIORITIES, type Priority, type Status, type WorkItem } from '@rytask/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_FILTER_BAR_VALUE,
  FilterBar,
  type FilterBarValue,
  type SaveViewInput,
  type WorkItemQuery,
} from '../../../../components/filter-bar';
import {
  ApiError,
  createWorkItem,
  listAllWorkItems,
  listStatuses,
  saveView,
  updateWorkItem,
} from '../api-client';
import { WorkItemDetail } from '../work-item-detail';

/**
 * List view (US3, T061, FR-VIEW-001). Reads `GET /api/v1/work-items` (flat keyset page,
 * `{ data, pageInfo }`) and renders one editable row per item. Inline edits call
 * `PATCH /api/v1/work-items/{id}` with the item's optimistic `version`; the returned item
 * (with its bumped version) replaces the row so subsequent edits stay consistent. Title is
 * an inline text field; priority is a select. A stale version surfaces a 409 message.
 * Keyboard-accessible (every cell is a labelled control) for axe.
 */

interface ListState {
  statuses: Status[];
  items: WorkItem[];
}

export function ListClient({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ListState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [quickAdd, setQuickAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterValue, setFilterValue] = useState<FilterBarValue>(EMPTY_FILTER_BAR_VALUE);
  const [query, setQuery] = useState<WorkItemQuery>({ projectId, sort: 'number' });

  const load = useCallback(async () => {
    try {
      const [statuses, items] = await Promise.all([
        listStatuses(projectId),
        // The FilterBar's compiled query drives the read (filter AST / smart view / sort);
        // its default (`{ projectId, sort: 'number' }`) reproduces the original ordered list.
        listAllWorkItems(projectId, { ...query, sort: query.sort ?? 'number' }),
      ]);
      setState({ statuses, items });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load list');
    }
  }, [projectId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSaveView = useCallback(async (input: SaveViewInput) => {
    await saveView({
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      projectId: input.projectId ?? undefined,
      filters: input.filters,
      grouping: input.grouping,
      sort: input.sort,
    });
  }, []);

  const replaceItem = useCallback((updated: WorkItem) => {
    setState((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev,
    );
  }, []);

  const patch = useCallback(
    async (item: WorkItem, fields: Partial<Pick<WorkItem, 'title' | 'priority' | 'dueDate'>>) => {
      try {
        setBusy(true);
        const updated = await updateWorkItem(item.id, { version: item.version, ...fields });
        replaceItem(updated);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setError('This item changed elsewhere — reloading.');
          await load();
        } else {
          setError(e instanceof ApiError ? e.message : 'Update failed');
        }
      } finally {
        setBusy(false);
      }
    },
    [replaceItem, load],
  );

  async function onQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = quickAdd.trim();
    if (!value || busy) return;
    try {
      setBusy(true);
      await createWorkItem({ projectId, quickAdd: value });
      setQuickAdd('');
      await load();
    } catch (e2) {
      setError(e2 instanceof ApiError ? e2.message : 'Capture failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !state) {
    return (
      <main>
        <h1>List</h1>
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main>
        <h1>List</h1>
        <p>Loading list…</p>
      </main>
    );
  }

  const statusName = (id: string) => state.statuses.find((s) => s.id === id)?.name ?? id;

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>List</h1>
        <nav>
          <Link href={`/projects/${projectId}/board`}>Board view</Link>
        </nav>
      </header>

      <FilterBar
        projectId={projectId}
        value={filterValue}
        onChange={setFilterValue}
        onQueryChange={setQuery}
        onSaveView={onSaveView}
      />

      <form onSubmit={onQuickAdd} aria-label="Quick add work item">
        <input
          type="text"
          data-testid="quick-add-input"
          aria-label="Quick add"
          placeholder="Capture a task…  @assignee #label !priority ^date"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !quickAdd.trim()}>
          Add
        </button>
      </form>

      {error ? <p role="alert">{error}</p> : null}

      <table data-testid="work-item-list" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption className="sr-only">Work items</caption>
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Due</th>
            <th scope="col">Open</th>
          </tr>
        </thead>
        <tbody>
          {state.items.map((item) => (
            <ListRow
              key={item.id}
              item={item}
              statusName={statusName(item.statusId)}
              busy={busy}
              onPatch={patch}
              onOpen={() => setSelected(item)}
            />
          ))}
        </tbody>
      </table>

      {state.items.length === 0 ? <p>No work items yet — capture one above.</p> : null}

      {selected ? (
        <WorkItemDetail
          item={selected}
          statuses={state.statuses}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

function ListRow({
  item,
  statusName,
  busy,
  onPatch,
  onOpen,
}: {
  item: WorkItem;
  statusName: string;
  busy: boolean;
  onPatch: (
    item: WorkItem,
    fields: Partial<Pick<WorkItem, 'title' | 'priority' | 'dueDate'>>,
  ) => Promise<void>;
  onOpen: () => void;
}) {
  const [title, setTitle] = useState(item.title);

  // Keep the local draft in sync when the row is replaced by a server response.
  useEffect(() => {
    setTitle(item.title);
  }, [item.title]);

  function commitTitle() {
    const next = title.trim();
    if (!next || next === item.title) {
      setTitle(item.title);
      return;
    }
    void onPatch(item, { title: next });
  }

  return (
    <tr data-testid="work-item-row" style={{ borderTop: '1px solid #e3e5e8' }}>
      <td>
        <code>{item.key}</code>
      </td>
      <td>
        <input
          type="text"
          aria-label={`Title for ${item.key}`}
          value={title}
          disabled={busy}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setTitle(item.title);
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{ width: '100%' }}
        />
      </td>
      <td>{statusName}</td>
      <td>
        <label className="sr-only" htmlFor={`prio-${item.id}`}>
          Priority for {item.key}
        </label>
        <select
          id={`prio-${item.id}`}
          value={item.priority}
          disabled={busy}
          onChange={(e) => void onPatch(item, { priority: e.target.value as Priority })}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="sr-only" htmlFor={`due-${item.id}`}>
          Due date for {item.key}
        </label>
        <input
          id={`due-${item.id}`}
          type="date"
          value={item.dueDate ?? ''}
          disabled={busy}
          onChange={(e) => void onPatch(item, { dueDate: e.target.value || null })}
        />
      </td>
      <td>
        <button type="button" onClick={onOpen} aria-label={`Open ${item.key}`}>
          Open
        </button>
      </td>
    </tr>
  );
}
