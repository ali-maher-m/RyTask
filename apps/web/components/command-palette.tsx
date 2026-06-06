'use client';

import { search } from '@/lib/api';
import type { SearchResult, SearchResultType } from '@rytask/contracts';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './command-palette.module.css';

/**
 * Global Cmd/Ctrl-K command palette (US11, T089, FR-WEB-090). Opens on `Cmd/Ctrl-K` from any
 * authed screen, debounce-queries `GET /api/v1/search?q=…` through the consolidated data layer
 * (`@/lib/api`, D8), and renders the ranked hits grouped by type (items / projects / labels /
 * people / comments) inside a `cmdk` dialog. Every hit completes a navigate-or-create in ≤2
 * actions: type → select (Enter or click) to navigate, or — when nothing matches — select the
 * "Create work item" affordance. The dialog is a focus-trapped Radix modal (cmdk `Command.Dialog`):
 * arrow keys move the active item, Enter selects, Escape closes — fully keyboard-accessible for axe.
 *
 * Token-only by construction (Principle VIII): all visual values live in `command-palette.module.css`
 * as `var(--*)` tokens; this component carries no inline color/spacing literals.
 */

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
 * hit cannot be navigated (e.g. a label hit with no owning project) so the row is rendered but
 * inert rather than routing nowhere.
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

export interface CommandPaletteProps {
  /** Start open (uncontrolled; used by tests). Defaults to closed; Cmd/Ctrl-K toggles it. */
  defaultOpen?: boolean;
  /** Controlled open state — when provided, the parent owns visibility (e.g. the shell topbar). */
  open?: boolean;
  /** Controlled open change — fires on Cmd/Ctrl-K, Escape, selection, and scrim click. */
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: CommandPaletteProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  // The global keydown closure reads the latest open state from a ref so it never re-binds.
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>(EMPTY_STATE);
  // Monotonic request id: only the newest in-flight search may commit its result (last-wins).
  const seqRef = useRef(0);

  // Global Cmd/Ctrl-K toggles the palette from anywhere in the app.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(!openRef.current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  // Reset the query + results whenever the dialog closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setState(EMPTY_STATE);
      seqRef.current += 1; // invalidate any in-flight request
    }
  }, [open]);

  // Debounced search: each keystroke schedules a fetch; a newer keystroke supersedes the prior one.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      seqRef.current += 1;
      setState(EMPTY_STATE);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: false }));
    const handle = setTimeout(() => {
      seqRef.current += 1;
      const seq = seqRef.current;
      search(trimmed)
        .then((results) => {
          if (seq === seqRef.current) setState({ results, loading: false, error: false });
        })
        .catch(() => {
          if (seq === seqRef.current) setState({ results: [], loading: false, error: true });
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
    [router, setOpen],
  );

  const trimmedQuery = query.trim();
  const showCreate = trimmedQuery.length > 0 && !state.loading;
  const showEmpty =
    trimmedQuery.length > 0 && !state.loading && !state.error && state.results.length === 0;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search and commands"
      shouldFilter={false}
      loop
      overlayClassName={styles.overlay}
      contentClassName={styles.content}
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search items, projects, labels, people…"
        aria-label="Search"
      />

      <Command.List aria-label="Search results">
        {state.loading ? (
          <Command.Loading>
            <output className={styles.status}>Searching…</output>
          </Command.Loading>
        ) : null}

        {state.error ? (
          <div role="alert" className={styles.error}>
            Search failed — please try again.
          </div>
        ) : null}

        {showEmpty ? (
          <Command.Empty className={styles.status}>No matches for “{trimmedQuery}”.</Command.Empty>
        ) : null}

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
                    {hit.snippet ? <small className={styles.snippet}>{hit.snippet}</small> : null}
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
              <span>Create work item “{trimmedQuery}”</span>
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
