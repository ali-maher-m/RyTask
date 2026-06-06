'use client';

import { search } from '@/lib/api';
import type { SearchResult, SearchResultType } from '@rytask/contracts';
import { EmptyState, ErrorState, Input, Skeleton } from '@rytask/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './search.module.css';

/**
 * Full search results surface (US11, T090, FR-WEB-091). A ranked, grouped view over
 * `GET /api/v1/search?q=…` (via the consolidated `@/lib/api` layer, D8). Ranking, tenancy, and
 * permission scoping are all enforced server-side — this surface only ever renders what the API
 * returns, so it shows zero foreign data by construction (FR-WEB-101). The query is seeded from
 * `?q=` for shareable deep links and kept in the URL as the box changes. Token-only (Principle VIII).
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
 * Map a hit to the route it opens — items/comments/labels live under their project's list view,
 * a project opens its own list, a person falls back to cross-project "My Work". Returns `null`
 * when a hit has no navigable target so it renders inert rather than routing nowhere.
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

function initialQuery(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

export function SearchClient() {
  const router = useRouter();
  const [query, setQuery] = useState<string>(initialQuery);
  const [state, setState] = useState<SearchState>(EMPTY_STATE);
  // Monotonic request id: only the newest in-flight search may commit its result (last-wins).
  const seqRef = useRef(0);

  // Keep the URL in step with the box so a result page is shareable / reload-safe.
  useEffect(() => {
    const trimmed = query.trim();
    router.replace(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  }, [query, router]);

  // Run a search now (used by the debounce below and the ErrorState retry). A superseding call
  // bumps the request id so an older in-flight response can no longer commit.
  const runSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    seqRef.current += 1;
    const seq = seqRef.current;
    if (!trimmed) {
      setState(EMPTY_STATE);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: false }));
    search(trimmed)
      .then((results) => {
        if (seq === seqRef.current) setState({ results, loading: false, error: false });
      })
      .catch(() => {
        if (seq === seqRef.current) setState({ results: [], loading: false, error: true });
      });
  }, []);

  // Debounced search: each keystroke schedules a fetch; a newer keystroke supersedes the prior one.
  useEffect(() => {
    const handle = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const grouped = useMemo(() => groupResults(state.results), [state.results]);
  const trimmedQuery = query.trim();
  const hasResults = state.results.length > 0;

  return (
    <section className={styles.page} aria-label="Search">
      <div className={styles.header}>
        <h1 className={styles.title}>Search</h1>
        <p className={styles.subtitle}>
          Find anything across your projects, items, labels, and people.
        </p>
      </div>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <Input
          label="Search"
          type="search"
          autoFocus
          placeholder="Search items, projects, labels, people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      {!trimmedQuery ? (
        <EmptyState
          title="Start typing to search"
          description="Results are ranked and limited to this workspace and what you can access."
        />
      ) : state.loading ? (
        <div className={styles.skeletons} aria-busy="true" aria-label="Searching">
          <Skeleton height="3.5rem" />
          <Skeleton height="3.5rem" />
          <Skeleton height="3.5rem" />
        </div>
      ) : state.error ? (
        <ErrorState
          title="Search didn’t work"
          description="We couldn’t run that search just now. Please try again."
          onRetry={() => runSearch(query)}
        />
      ) : !hasResults ? (
        <EmptyState
          title={`No matches for “${trimmedQuery}”`}
          description="Try a different term, or check your spelling."
        />
      ) : (
        <div className={styles.results} data-testid="search-results">
          {GROUPS.map(({ type, heading }) => {
            const hits = grouped[type];
            if (!hits || hits.length === 0) return null;
            return (
              <section key={type} className={styles.group} aria-label={heading}>
                <h2 className={styles.groupHeading}>
                  {heading}
                  <span className={styles.count}>{hits.length}</span>
                </h2>
                {hits.map((hit) => (
                  <ResultRow key={`${hit.type}:${hit.id}`} hit={hit} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A single ranked hit — a Link when navigable, otherwise an inert row (no dead navigation). */
function ResultRow({ hit }: { hit: SearchResult }) {
  const href = routeFor(hit);
  const body = (
    <>
      <span className={styles.itemTitle}>{hit.title}</span>
      {hit.snippet ? <span className={styles.snippet}>{hit.snippet}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={styles.item} data-testid="search-result">
      {body}
    </Link>
  ) : (
    <div className={styles.item} data-testid="search-result">
      {body}
    </div>
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
