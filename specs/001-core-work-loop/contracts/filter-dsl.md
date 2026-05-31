# Contract: Filter / Query DSL (one query engine)

The same JSON contract drives List, Board, saved views, smart views, "My Work", and the narrowing of
search results (research D6, ADR-005). It is compiled to a Drizzle `SQL` predicate by
`modules/views/domain/query-compiler.ts`; it is serialized verbatim into `views.filters/sort/grouping`
and accepted by `GET /work-items?filter=` (base64-encoded JSON). Values are **always bound
parameters** — never string-interpolated (injection-safe).

## Filter AST

```ts
type FilterNode = Group | Condition;

interface Group {
  op: 'and' | 'or';
  conditions: FilterNode[];   // groups nest arbitrarily (FR-VIEW-006)
}

interface Condition {
  field: FieldKey;            // from the typed field registry below
  operator: Operator;         // validated against the field's type
  value: unknown;             // bound parameter; shape depends on operator
}
```

### Field registry (M1)

| field | type | operators |
|---|---|---|
| `status` | id (status) | `eq`, `neq`, `in`, `nin` |
| `statusCategory` | enum | `eq`, `in` |
| `priority` | enum (ordered) | `eq`, `neq`, `in`, `gt`, `lt` (by ordinal URGENT→NONE) |
| `assignee` | id (user) / `me` | `eq`, `neq`, `in`, `isNull` |
| `label` | id (label) | `in`, `nin`, `isEmpty` |
| `project` | id (project) | `eq`, `in` |
| `parent` | id (work_item) / `isNull` | `eq`, `isNull` |
| `dueDate` | date | `eq`, `before`, `after`, `between`, `isNull` |
| `startDate` | date | `before`, `after`, `between`, `isNull` |
| `endDate` | date | `before`, `after`, `between`, `isNull` |
| `overdue` | boolean (computed) | `eq` (true/false) |
| `text` | full-text | `contains` (delegates to FTS, D8) |
| `createdAt` / `updatedAt` | datetime | `before`, `after`, `between` |

`me` resolves to the current principal at compile time. `overdue=true` compiles to
`due_date < today(orgTz) AND status.category NOT IN ('COMPLETED','CANCELLED')` (FR-DATE-003).
Unknown field/operator combinations are rejected by a unit-tested domain validator (`400`).

### Example (the spec's compound case, FR-VIEW-006 / SC-006)

`priority = Urgent AND (label = bug OR overdue)`:

```json
{
  "op": "and",
  "conditions": [
    { "field": "priority", "operator": "eq", "value": "URGENT" },
    { "op": "or", "conditions": [
      { "field": "label", "operator": "in", "value": ["<bug-label-id>"] },
      { "field": "overdue", "operator": "eq", "value": true }
    ] }
  ]
}
```

## Sort (multi-key, FR-VIEW-007)

```json
[ { "field": "priority", "dir": "desc" }, { "field": "dueDate", "dir": "asc" } ]
```

`priority desc` orders `URGENT→NONE` by enum ordinal. The compiler always appends `id` as the final
tiebreaker so the order is total (required for stable keyset pagination).

## Grouping (FR-VIEW-007)

`{ "field": "status" | "assignee" | "priority" | "label" | "project" }`. The engine returns each row's
group key (and optional per-group counts); the client renders sections. Priority groups are ordered
`URGENT→NONE`.

## Cursor pagination (keyset, ADR-005 / FR-VIEW-010)

The cursor encodes the last row's sort-key tuple `(…sortValues, id)`. The next page predicate is the
lexicographic `>`/`<` of that tuple per each key's direction. Response envelope:

```json
{ "data": [ /* WorkItem[] */ ], "pageInfo": { "nextCursor": "<base64>|null", "hasNextPage": true } }
```

`limit` default 50, max 200. No `OFFSET` on hot lists (keeps the ~1,000-item view responsive, SC-011).

## Smart views (code-defined, not stored — D7)

| name | AST |
|---|---|
| `my-issues` | `assignee = me` (within scope) |
| `my-work` | `assignee = me`, `project = null` (cross-project, FR-PROJ-006) |
| `due-soon` | `dueDate between [today, today+N]` AND `statusCategory nin [COMPLETED, CANCELLED]` |
| `overdue` | `overdue = true` |
| `urgent` | `priority = URGENT` AND `statusCategory nin [COMPLETED, CANCELLED]` |

Exposed via `GET /work-items?smart=<name>`; each returns the correct live set for the current user
(SC-007). `N` for Due Soon defaults to 7 days (org-configurable later).
