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
  updated_at: 'updatedAt',
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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Structured view model (US7, T067, contracts/view-config.md — mirrors 001 filter-dsl.md).
//
// The wire-form `ViewConfig` above is the URL *carrier* used by the Board/List carry-over (its
// `filter`/`sort` are already-serialized strings). `ViewSpec` is the *structured* model the FilterBar
// builds and the round-trip serializer (T065) covers: a typed Filter AST + multi-key sort + group +
// optional smart key / scope / name. `serializeViewSpec`/`deserializeViewSpec` are an exact inverse
// pair (the round-trip invariant), and `viewSpecToWorkItemQuery` compiles a spec to the same wire
// query the carrier uses — so saved views, the FilterBar, and the carry-over all hit one query path.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** A field the M1 query engine can filter on (filter-dsl.md field registry — full set). */
export type FilterField =
  | 'status'
  | 'statusCategory'
  | 'priority'
  | 'assignee'
  | 'label'
  | 'project'
  | 'parent'
  | 'dueDate'
  | 'startDate'
  | 'endDate'
  | 'overdue'
  | 'text'
  | 'createdAt'
  | 'updatedAt';

/** An operator, validated against the field's type by the server's domain validator. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'gt'
  | 'lt'
  | 'before'
  | 'after'
  | 'between'
  | 'contains'
  | 'isNull'
  | 'isEmpty';

/** A single leaf condition (`field operator value`). `value` shape depends on the operator. */
export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  value: unknown;
}

/** A boolean group of conditions / sub-groups (groups nest arbitrarily — FR-WEB-040). */
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: FilterNode[];
}

export type FilterNode = FilterGroup | FilterCondition;

/** A sortable field (multi-key — FR-WEB-041). `priority desc` orders URGENT→NONE by ordinal. */
export type SortKey =
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'endDate'
  | 'createdAt'
  | 'updatedAt'
  | 'number';

/** One key of the multi-key sort. */
export interface SortSpec {
  field: SortKey;
  dir: 'asc' | 'desc';
}

/** A group-by field (filter-dsl.md grouping). `'none'` = ungrouped. */
export type GroupKey = 'status' | 'assignee' | 'priority' | 'label' | 'project' | 'none';

/** A code-defined smart view (D7/D14); server-resolved live (`me`/`overdue` bound server-side). */
export type SmartKey = 'my-issues' | 'due-soon' | 'overdue' | 'urgent';

/**
 * The structured view a List/Board/My-Work/saved/smart surface renders from (contracts/view-config.md).
 * When `smart` is set the server resolves the live set and `filter` is ignored. `scope`/`name` carry
 * a saved view's visibility + label.
 */
export interface ViewSpec {
  layout: ViewLayout;
  group?: GroupKey;
  sort?: SortSpec[];
  filter?: FilterNode;
  smart?: SmartKey;
  scope?: 'personal' | 'shared';
  name?: string;
}

// ── Filter AST ⇄ base64 JSON (mirrors the server's `Buffer.from(filter,'base64')`, FR-WEB-040) ──

/** UTF-8-safe base64 of a Filter AST → the `?filter=` param the M1 query engine decodes. */
export function encodeFilterAst(node: FilterNode): string {
  const json = JSON.stringify(node);
  // btoa handles only Latin-1; widen to bytes first so multi-byte values survive the round-trip.
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Decode a `?filter=` base64 JSON param back to a Filter AST (`undefined` on absent/garbled input). */
export function decodeFilterAst(b64: string | null | undefined): FilterNode | undefined {
  if (!b64) return undefined;
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as FilterNode;
  } catch {
    return undefined;
  }
}

// ── Multi-key sort ⇄ `-priority,due_date` wire form (filter-dsl.md) ──

const SORT_FIELD_TO_SNAKE: Record<SortKey, string> = {
  priority: 'priority',
  dueDate: 'due_date',
  startDate: 'start_date',
  endDate: 'end_date',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  number: 'number',
};

/** Serialize the multi-key sort to the `-priority,due_date` wire form (`undefined` when empty). */
export function encodeSortSpec(sort: SortSpec[] | undefined): string | undefined {
  if (!sort || sort.length === 0) return undefined;
  return sort.map((k) => `${k.dir === 'desc' ? '-' : ''}${SORT_FIELD_TO_SNAKE[k.field]}`).join(',');
}

/** Decode the `-priority,due_date` wire form back to typed sort keys. */
export function decodeSortSpec(wire: string | null | undefined): SortSpec[] {
  return decodeSort(wire).map((k) => ({ field: k.field as SortKey, dir: k.dir }));
}

// ── Round-trip: ViewSpec ⇄ URLSearchParams (the T065 invariant) ──

/**
 * Serialize a `ViewSpec` to a stable `URLSearchParams`: `filter`→base64 JSON (or `smart`→key),
 * `sort`→wire form, `group`/`scope`/`name`→keys, `layout` carried explicitly so the inverse is
 * total. Params are sorted so the same spec always yields the same string.
 */
export function serializeViewSpec(spec: ViewSpec): URLSearchParams {
  const params = new URLSearchParams();
  params.set('layout', spec.layout);
  if (spec.smart) {
    params.set('smart', spec.smart);
  } else if (spec.filter) {
    params.set('filter', encodeFilterAst(spec.filter));
  }
  const sort = encodeSortSpec(spec.sort);
  if (sort) params.set('sort', sort);
  if (spec.group && spec.group !== 'none') params.set('group', spec.group);
  if (spec.scope) params.set('scope', spec.scope);
  if (spec.name) params.set('name', spec.name);
  params.sort();
  return params;
}

/**
 * Deserialize a `ViewSpec` from search params — the exact inverse of {@link serializeViewSpec}.
 * `deserializeViewSpec(serializeViewSpec(cfg))` is structurally equal to `cfg` for every supported
 * field/operator/value, including nested groups (round-trip invariant, view-config.md).
 */
export function deserializeViewSpec(params: ParamReader): ViewSpec {
  const spec: ViewSpec = { layout: (params.get('layout') as ViewLayout) ?? 'list' };
  const smart = params.get('smart');
  if (smart) {
    spec.smart = smart as SmartKey;
  } else {
    const filter = decodeFilterAst(params.get('filter'));
    if (filter) spec.filter = filter;
  }
  const sort = decodeSortSpec(params.get('sort'));
  if (sort.length) spec.sort = sort;
  const group = params.get('group');
  if (group) spec.group = group as GroupKey;
  const scope = params.get('scope');
  if (scope === 'personal' || scope === 'shared') spec.scope = scope;
  const name = params.get('name');
  if (name) spec.name = name;
  return spec;
}

/** Compile a `ViewSpec` to the wire `WorkItemQuery` a List/Board read consumes (one query path). */
export function viewSpecToWorkItemQuery(spec: ViewSpec, projectId?: string): ViewWorkItemQuery {
  const group = spec.group && spec.group !== 'none' ? spec.group : undefined;
  const sort = encodeSortSpec(spec.sort);
  if (spec.smart) {
    return { projectId, smart: spec.smart, group, sort };
  }
  return {
    projectId,
    filter: spec.filter ? encodeFilterAst(spec.filter) : undefined,
    group,
    sort,
  };
}

/** A JSON object that is a Filter AST node (has a group `op` or a leaf `field`), else `undefined`. */
function asFilterNode(value: unknown): FilterNode | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (obj.op === 'and' || obj.op === 'or') return obj as unknown as FilterGroup;
  if (typeof obj.field === 'string') return obj as unknown as FilterCondition;
  return undefined;
}

/** A persisted saved view's stored fields, as restored from `GET /views/{id}` (loose JSON). */
export interface SavedViewLike {
  kind: 'BOARD' | 'LIST';
  scope: 'PERSONAL' | 'SHARED';
  name: string;
  projectId: string | null;
  filters: Record<string, unknown>;
  grouping: Record<string, unknown> | null;
  sort: Array<Record<string, unknown>>;
}

/** Reconstruct a `ViewSpec` from a saved view row so reopening restores its full config (T069). */
export function savedViewToViewSpec(view: SavedViewLike): ViewSpec {
  const spec: ViewSpec = { layout: view.kind === 'BOARD' ? 'board' : 'list' };
  const filter = asFilterNode(view.filters);
  if (filter) spec.filter = filter;
  const sort: SortSpec[] = [];
  for (const k of view.sort ?? []) {
    const field = k.field as SortKey | undefined;
    const dir = k.dir === 'desc' ? 'desc' : 'asc';
    if (field && field in SORT_FIELD_TO_SNAKE) sort.push({ field, dir });
  }
  if (sort.length) spec.sort = sort;
  const group = view.grouping?.field as GroupKey | undefined;
  if (group && group !== 'none') spec.group = group;
  spec.scope = view.scope === 'SHARED' ? 'shared' : 'personal';
  spec.name = view.name;
  return spec;
}
