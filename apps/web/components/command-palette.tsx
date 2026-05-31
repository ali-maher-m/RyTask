'use client';

import type { SearchEnvelope, SearchResult, SearchResultType } from '@rytask/contracts';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Global Cmd/Ctrl-K command palette (US8, T123, FR-SRCH-001/FR-SRCH-004). Opens on
 * `Cmd/Ctrl-K`, debounce-queries `GET /api/v1/search?q=…`, and renders the ranked hits grouped
 * by type (items / projects / labels / users) inside a `cmdk` dialog. Every hit completes a
 * navigate-or-create action in ≤2 keystrokes: type → arrow/Enter (navigate), or — when nothing
 * matches — Enter on the "Create work item" affordance. The dialog is a Radix focus-trapped
 * modal (cmdk `Command.Dialog`): arrow keys move the active item, Enter selects, Escape closes,
 * so it is fully keyboard-accessible for axe. Like the rest of `apps/web`, the hand-written
 * `@rytask/sdk` only covers health today, so this calls `/api/v1` with `fetch`, resolving the
 * dev principal from headers (M1 seam — apps/api `resolveDevPrincipal`), mirroring
 * `components/quick-add.tsx` and `app/projects/[projectId]/api-client.ts`.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Dev principal headers (M1 seam — apps/api/src/common/auth/principal.ts). */
const SEED_USER_ID = '0193b3a0-0000-7000-8000-000000000003';
const SEED_ORG_ID = '0193b3a0-0000-7000-8000-000000000001';
const SEED_WORKSPACE_ID = '0193b3a0-0000-7000-8000-000000000002';

function principalHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-user-id': process.env.NEXT_PUBLIC_DEV_USER_ID ?? SEED_USER_ID,
    'x-organization-id': process.env.NEXT_PUBLIC_DEV_ORG_ID ?? SEED_ORG_ID,
    'x-workspace-id': process.env.NEXT_PUBLIC_DEV_WORKSPACE_ID ?? SEED_WORKSPACE_ID,
  };
}

/** Debounce window for the search query (keystroke → fetch). */
const SEARCH_DEBOUNCE_MS = 200;

/** Result groups, in display order; mirrors `searchResultTypes` (work_item, comment, …). */
const GROUPS: ReadonlyArray<{ type: SearchResultType; heading: string }> = [
  { type: 'work_item', heading: 'Work items' },
  { type: 'project', heading: 'Projects' },
  { type: 'label', heading: 'Labels' },
  { type: 'user', heading: 'People' },
  { type: 'comment', heading: 'Comments' },
];

/**
 * Map a hit to the route it should open. Work items, comments and labels all live under a
 * project's list view today (the only per-item surface in M1); a project opens its own list;
 * a user with no dedicated page falls back to cross-project "My Work". Returns `null` when a
 * hit cannot be navigated (e.g. a user-type hit's id is the user, not a project) so the row is
 * rendered but inert rather than routing nowhere.
 */
function routeFor(hit: SearchResult): string | null {
  switch (hit.type) {
    case 'project':
      return `/projects/${hit.id}/list`;
    case 'work_item':
    case 'comment':
    case 'label':
      return hit.projectId ? `/projects/${hit.projectId}/list` : null;
    case 'user':
      return '/my-work';
    default:
      return null;
  }
}

interface SearchState {
  results: SearchResult[];
  loading: boolean;
  error: boolean;
}

const EMPTY_STATE: SearchState = { results: [], loading: false, error: false };

/**
 * Run a search against `GET /api/v1/search`. Returns the ranked hits in server order
 * (`ts_rank_cd` desc); the dialog disables cmdk's own filtering (`shouldFilter={false}`) so the
 * server ranking is preserved. The provided `AbortSignal` cancels superseded requests.
 */
async function runSearch(q: string, signal: AbortSignal): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: '20' });
  const res = await fetch(`${API_BASE}/api/v1/search?${params.toString()}`, {
    headers: principalHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`);
  }
  const body = (await res.json()) as SearchEnvelope;
  return body.data ?? [];
}

export interface CommandPaletteProps {
  /** Start open (used by tests/storybook). Defaults to closed; Cmd/Ctrl-K toggles it. */
  defaultOpen?: boolean;
}

export function CommandPalette({ defaultOpen = false }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  // Global Cmd/Ctrl-K toggles the palette from anywhere in the app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset the query + results whenever the dialog closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setState(EMPTY_STATE);
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  // Debounced search: each keystroke schedules a fetch; a new keystroke cancels the prior one.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      abortRef.current?.abort();
      abortRef.current = null;
      setState(EMPTY_STATE);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      runSearch(trimmed, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setState({ results, loading: false, error: false });
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setState({ results: [], loading: false, error: true });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, open]);

  const grouped = useMemo(() => groupResults(state.results), [state.results]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const trimmedQuery = query.trim();
  const showCreate = trimmedQuery.length > 0 && !state.loading;
  const showEmpty =
    trimmedQuery.length > 0 && !state.loading && !state.error && state.results.length === 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      shouldFilter={false}
      loop
      aria-label="Search and commands"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search items, projects, labels, people…  (⌘K)"
        aria-label="Search"
      />

      <Command.List aria-label="Search results">
        {state.loading ? (
          <Command.Loading label="Searching…">
            <output>Searching…</output>
          </Command.Loading>
        ) : null}

        {state.error ? (
          <div role="alert" style={{ padding: '0.5rem 0.75rem', color: '#b00020' }}>
            Search failed — please try again.
          </div>
        ) : null}

        {showEmpty ? <Command.Empty>No matches for “{trimmedQuery}”.</Command.Empty> : null}

        {GROUPS.map(({ type, heading }) => {
          const hits = grouped[type];
          if (!hits || hits.length === 0) return null;
          return (
            <Command.Group key={type} heading={heading}>
              {hits.map((hit) => {
                const href = routeFor(hit);
                return (
                  <Command.Item
                    key={`${hit.type}:${hit.id}`}
                    value={`${hit.type}:${hit.id}`}
                    keywords={hit.snippet ? [hit.title, hit.snippet] : [hit.title]}
                    disabled={href === null}
                    onSelect={() => {
                      if (href) navigate(href);
                    }}
                  >
                    <span>{hit.title}</span>
                    {hit.snippet ? (
                      <small style={{ display: 'block', opacity: 0.7 }}>{hit.snippet}</small>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          );
        })}

        {showCreate ? (
          <Command.Group heading="Actions">
            <Command.Item
              value="__create__"
              keywords={['create', 'new', 'add', trimmedQuery]}
              onSelect={() => {
                navigate(`/my-work?create=${encodeURIComponent(trimmedQuery)}`);
              }}
            >
              Create work item “{trimmedQuery}”
            </Command.Item>
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}

/** Bucket the flat ranked result list into per-type lists, preserving server rank order. */
function groupResults(results: SearchResult[]): Record<SearchResultType, SearchResult[]> {
  const buckets: Record<SearchResultType, SearchResult[]> = {
    work_item: [],
    comment: [],
    project: [],
    label: [],
    user: [],
  };
  for (const hit of results) {
    buckets[hit.type].push(hit);
  }
  return buckets;
}
