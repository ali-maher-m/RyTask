/**
 * Client `ViewConfig` carry-over (US4, T052, FR-WEB-032, D14). One query path drives the List and
 * the Board: a view is `{ layout, filter?, smart?, group?, sort? }`, where `filter` is the already
 * base64-encoded compound AST (built by the FilterBar — US7/T067 owns the AST builder/round-trip),
 * `smart` selects a code-defined live view, and `group`/`sort` are the wire forms the M1 query engine
 * reads (filter-dsl.md). This module is deliberately the *carry-over* seam: it (de)serializes a view
 * to/from URL search params and compiles it to a `WorkItemQuery`, so switching Board↔List preserves
 * the active filter / grouping / sort over a single shared query (the URL is the carrier). The full
 * AST serializer + round-trip is layered on in US7 against the same field registry.
 */

/** Which work surface a view renders on. */
export type ViewLayout = 'board' | 'list';

/**
 * The serializable, layout-tagged query a List/Board reads from (and writes to) the URL. All query
 * fields are the compiled wire forms the API accepts directly (`?filter=`/`?smart=`/`?group=`/`?sort=`);
 * `filter` is base64(JSON(AST)). Every field is optional so a bare Board/List falls back to its default.
 */
export interface ViewConfig {
  layout: ViewLayout;
  filter?: string;
  smart?: string;
  group?: string;
  sort?: string;
}

/** The compiled query a List/Board page hands to `listAllWorkItems` (mirrors the api-client type). */
export interface ViewWorkItemQuery {
  projectId?: string;
  filter?: string;
  smart?: string;
  group?: string;
  sort?: string;
}

/** Only these keys travel on the URL; `layout` is carried by the route path itself. */
const QUERY_KEYS = ['filter', 'smart', 'group', 'sort'] as const;

/** A minimal read interface satisfied by both `URLSearchParams` and Next's `ReadonlyURLSearchParams`. */
export interface ParamReader {
  get(key: string): string | null;
}

/**
 * Compile a view into the `WorkItemQuery` the read uses. A `smart` view is the live, code-defined set
 * and ignores the compound `filter` (the server resolves it); otherwise the base64 `filter` is passed
 * through. `projectId` scopes the read (omitted for cross-project smart views by the caller).
 */
export function viewConfigToWorkItemQuery(cfg: ViewConfig, projectId?: string): ViewWorkItemQuery {
  if (cfg.smart) {
    return {
      projectId,
      smart: cfg.smart,
      group: cfg.group || undefined,
      sort: cfg.sort || undefined,
    };
  }
  return {
    projectId,
    filter: cfg.filter || undefined,
    group: cfg.group || undefined,
    sort: cfg.sort || undefined,
  };
}

/** Read a view from URL search params (layout supplied by the route). Unset keys stay `undefined`. */
export function parseViewConfig(params: ParamReader, layout: ViewLayout): ViewConfig {
  const cfg: ViewConfig = { layout };
  for (const key of QUERY_KEYS) {
    const raw = params.get(key);
    if (raw) cfg[key] = raw;
  }
  return cfg;
}

/** Serialize a view's query keys to a stable `URLSearchParams` (sorted; empty keys omitted). */
export function viewConfigToSearchParams(cfg: ViewConfig): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = cfg[key];
    if (value) params.set(key, value);
  }
  // Sort so the same config always produces the same string (round-trip stable, easy to assert).
  params.sort();
  return params;
}

/**
 * Build the href that switches to the other layout while carrying the active view (FR-WEB-032).
 * `/projects/{id}/list?filter=…&group=…&sort=…` ⇄ `/projects/{id}/board?…` — the query is identical
 * on both sides, so the surfaces read the same set; only the layout (and its rendering) changes.
 */
export function carryOverHref(projectId: string, target: ViewLayout, cfg: ViewConfig): string {
  const qs = viewConfigToSearchParams({ ...cfg, layout: target }).toString();
  return `/projects/${projectId}/${target}${qs ? `?${qs}` : ''}`;
}

// ── Sort wire-form helpers (filter-dsl.md `-priority,due_date`) ──────────────────────────────────
// The Board has no FilterBar UI yet, so it needs to decode a carried `sort=` back into typed keys to
// reflect it; the FilterBar (List) likewise re-seeds its sort from the URL. Group is a plain key.

const SORT_FIELD_FROM_SNAKE: Record<string, string> = {
  priority: 'priority',
  due_date: 'dueDate',
  start_date: 'startDate',
  end_date: 'endDate',
  created_at: 'createdAt',
  number: 'number',
};

export interface DecodedSortKey {
  field: string;
  dir: 'asc' | 'desc';
}

/** Decode `-priority,due_date` → `[{field:'priority',dir:'desc'},{field:'dueDate',dir:'asc'}]`. */
export function decodeSort(wire: string | null | undefined): DecodedSortKey[] {
  if (!wire) return [];
  const out: DecodedSortKey[] = [];
  for (const part of wire.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const desc = token.startsWith('-');
    const snake = desc ? token.slice(1) : token;
    const field = SORT_FIELD_FROM_SNAKE[snake];
    if (field) out.push({ field, dir: desc ? 'desc' : 'asc' });
  }
  return out;
}
