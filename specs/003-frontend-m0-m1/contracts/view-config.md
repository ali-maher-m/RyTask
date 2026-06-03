# Contract: Client View-Config Serialization

**Feature**: `003-frontend-m0-m1` | FR-WEB-040/041/042/043 | serializes `specs/001-core-work-loop/contracts/filter-dsl.md`

One client `ViewConfig` drives List, Board, "My Work", saved views, and smart views (D14). The client
**builds and serializes** the M1 Filter AST; the server compiles and evaluates it (the client never
filters tenant data itself — it asks the server). This makes Board↔List carry-over and saved/smart
views all one query path.

## Client model

```ts
interface ViewConfig {
  layout: 'board' | 'list';
  group?: 'status' | 'assignee' | 'priority' | 'label' | 'none';
  sort?: { field: SortKey; dir: 'asc' | 'desc' }[];     // multi-key (FR-WEB-041)
  filter?: FilterNode;                                  // compound AND/OR (FR-WEB-040)
  smart?: 'my-issues' | 'due-soon' | 'overdue' | 'urgent';   // when set, server resolves; `filter` ignored
  scope?: 'personal' | 'shared';                        // for saving (FR-WEB-042)
  name?: string;
}

// Mirrors filter-dsl.md exactly:
type FilterNode = Group | Condition;
interface Group { op: 'and' | 'or'; conditions: FilterNode[]; }
interface Condition { field: FieldKey; operator: Operator; value: unknown; }
```

### Field registry (must match M1 `filter-dsl.md`)
`status`, `statusCategory`, `priority` (ordered URGENT→NONE), `assignee` (id or `me`), `label`,
`project`, `parent`, `dueDate`, `startDate`, `endDate`, `overdue` (computed), `text`, `createdAt`,
`updatedAt`. The client offers only the operators each field's type allows; an invalid combination is
prevented in the builder (and rejected `400` server-side as a backstop).

## Serialization rules

| ViewConfig field | Request mapping |
|---|---|
| `filter` (and not `smart`) | base64-encode `JSON.stringify(filter)` → `GET /work-items?filter=<b64>` |
| `smart` | `GET /work-items?smart=<key>` (server resolves the live, code-defined view; `me`/`overdue` bound server-side) |
| `sort` | `GET /work-items?sort=<json>` per `[{field,dir},…]` |
| `group` | `GET /work-items?group=<key>` |
| `scope`+`name`+`filter`+`sort`+`group` | `POST /views` (`SaveView` DTO) for a saved view |
| project scope | `?projectId=` (omitted for cross-project My Work / smart views) |

- **Round-trip invariant** (unit-tested): `deserialize(serialize(cfg))` is structurally equal to `cfg`
  for every supported field/operator/value, including nested groups (the `priority = Urgent AND (label
  = bug OR overdue)` case from `filter-dsl.md`).
- **Priority ordering**: priority groups/sorts order Urgent→None (FR-WEB-041).
- **Smart views**: My Issues, Due Soon, Overdue, Urgent are always present in the UI and always
  current — they are server-resolved, never cached stale (FR-WEB-043).
- **Saved-view visibility**: `shared` views visible to project members; `personal` to the owner only
  (FR-WEB-042). Reopening restores the full `ViewConfig` (filter+group+sort+layout).

## Worked example (the spec's compound case)

`priority = Urgent AND (label = bug OR overdue)` →

```json
{ "op": "and", "conditions": [
  { "field": "priority", "operator": "eq", "value": "URGENT" },
  { "op": "or", "conditions": [
    { "field": "label", "operator": "in", "value": ["<bug-label-id>"] },
    { "field": "overdue", "operator": "eq", "value": true }
  ] }
] }
```
→ base64 → `GET /work-items?filter=<b64>&sort=[{"field":"priority","dir":"desc"},{"field":"dueDate","dir":"asc"}]&group=assignee`.

The returned set MUST exactly match an independently computed expected set — no false positives or
negatives (FR-WEB-040, SC-004).
