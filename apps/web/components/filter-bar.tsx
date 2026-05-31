'use client';

import { PRIORITIES, type Priority, STATUS_CATEGORIES } from '@rytask/contracts';
import { useCallback, useId, useMemo, useState } from 'react';

/**
 * Filter bar (US5, T088, FR-VIEW-006/007/008/009). One control surface that drives the List
 * and Board reads through the single query engine (filter-dsl.md, D6):
 *   - a compound filter: a flat list of conditions joined by a top-level AND/OR (matches the
 *     spec's `priority = Urgent AND (label = bug OR overdue)` shape — see {@link FilterCondition});
 *   - multi-key sort + a single group field (FR-VIEW-007);
 *   - a save-view affordance → POST /api/v1/views (FR-VIEW-008);
 *   - a smart-view switcher (My Issues / Due Soon / Overdue / Urgent) → GET
 *     /work-items?smart=… (FR-VIEW-009, D7).
 *
 * It is presentation-only: it emits a typed {@link FilterBarValue} via `onChange` and a
 * compiled {@link WorkItemQuery} via `onQueryChange`/`buildWorkItemQuery`, and delegates the
 * actual POST to an injected `onSaveView`. The filter AST is serialized to base64(JSON) for the
 * `filter=` query param, mirroring how `list-work-items.provider.ts` decodes it
 * (`JSON.parse(Buffer.from(filter,'base64').toString('utf8'))`). Fully keyboard-accessible
 * (labelled controls, a `<fieldset>`/`<legend>` per group) for axe.
 */

// ── Filter AST (filter-dsl.md; mirrored client-side — not exported from @rytask/contracts) ──

/** A field the M1 query engine can filter on (filter-dsl.md field registry). */
export type FilterField =
  | 'status'
  | 'statusCategory'
  | 'priority'
  | 'assignee'
  | 'label'
  | 'dueDate'
  | 'overdue';

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
  | 'isNull'
  | 'isEmpty';

/** A single leaf condition (`field operator value`). `value` shape depends on the operator. */
export interface FilterCondition {
  field: FilterField;
  operator: FilterOperator;
  value: unknown;
}

/** A boolean group of conditions/sub-groups (groups nest arbitrarily — FR-VIEW-006). */
export interface FilterGroup {
  op: 'and' | 'or';
  conditions: FilterNode[];
}

export type FilterNode = FilterGroup | FilterCondition;

/** A sort key (multi-key, FR-VIEW-007). `priority desc` is URGENT→NONE by ordinal. */
export type SortField = 'priority' | 'dueDate' | 'startDate' | 'endDate' | 'createdAt' | 'number';
export interface SortKey {
  field: SortField;
  dir: 'asc' | 'desc';
}

/** A group-by field (filter-dsl.md grouping). `''` = no grouping. */
export type GroupField = '' | 'status' | 'assignee' | 'priority' | 'label' | 'project';

/** A code-defined smart view (D7); `''` = use the compound filter instead. */
export type SmartView = '' | 'my-issues' | 'due-soon' | 'overdue' | 'urgent';

/** The full, serializable state of the bar (the typed `value` for controlled use). */
export interface FilterBarValue {
  smart: SmartView;
  op: 'and' | 'or';
  conditions: FilterCondition[];
  sort: SortKey[];
  group: GroupField;
}

/** The compiled query a List/Board page passes to `listAllWorkItems` (api-client). */
export interface WorkItemQuery {
  projectId?: string;
  filter?: string;
  smart?: string;
  group?: string;
  sort?: string;
}

export const EMPTY_FILTER_BAR_VALUE: FilterBarValue = {
  smart: '',
  op: 'and',
  conditions: [],
  sort: [],
  group: '',
};

// ── Field/operator registry (filter-dsl.md) ────────────────────────────────────────────────

interface FieldSpec {
  field: FilterField;
  label: string;
  operators: FilterOperator[];
  /** How the value editor renders (and what `value` shape it produces). */
  valueKind: 'priority' | 'statusCategory' | 'date' | 'text' | 'bool' | 'none';
}

/** The default field spec — also the safe fallback for an unknown field (never undefined). */
const DEFAULT_FIELD_SPEC: FieldSpec = {
  field: 'priority',
  label: 'Priority',
  operators: ['eq', 'neq', 'gt', 'lt'],
  valueKind: 'priority',
};

const FIELD_SPECS: readonly FieldSpec[] = [
  DEFAULT_FIELD_SPEC,
  {
    field: 'statusCategory',
    label: 'Status category',
    operators: ['eq'],
    valueKind: 'statusCategory',
  },
  { field: 'status', label: 'Status', operators: ['eq', 'neq'], valueKind: 'text' },
  { field: 'assignee', label: 'Assignee', operators: ['eq', 'neq', 'isNull'], valueKind: 'text' },
  { field: 'label', label: 'Label', operators: ['in', 'nin', 'isEmpty'], valueKind: 'text' },
  {
    field: 'dueDate',
    label: 'Due date',
    operators: ['eq', 'before', 'after', 'isNull'],
    valueKind: 'date',
  },
  { field: 'overdue', label: 'Overdue', operators: ['eq'], valueKind: 'bool' },
] as const;

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is any of',
  nin: 'is none of',
  gt: 'is higher than',
  lt: 'is lower than',
  before: 'before',
  after: 'after',
  isNull: 'is empty',
  isEmpty: 'is empty',
};

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: 'priority', label: 'Priority' },
  { field: 'dueDate', label: 'Due date' },
  { field: 'startDate', label: 'Start date' },
  { field: 'endDate', label: 'End date' },
  { field: 'createdAt', label: 'Created' },
  { field: 'number', label: 'Number' },
];

const GROUP_FIELDS: { field: GroupField; label: string }[] = [
  { field: '', label: 'No grouping' },
  { field: 'status', label: 'Status' },
  { field: 'assignee', label: 'Assignee' },
  { field: 'priority', label: 'Priority' },
  { field: 'label', label: 'Label' },
  { field: 'project', label: 'Project' },
];

const SMART_VIEWS: { view: SmartView; label: string }[] = [
  { view: '', label: 'All' },
  { view: 'my-issues', label: 'My Issues' },
  { view: 'due-soon', label: 'Due Soon' },
  { view: 'overdue', label: 'Overdue' },
  { view: 'urgent', label: 'Urgent' },
];

function specFor(field: FilterField): FieldSpec {
  return FIELD_SPECS.find((s) => s.field === field) ?? DEFAULT_FIELD_SPEC;
}

/** A fresh leaf condition with a valid operator/value for `field`. */
function newCondition(field: FilterField): FilterCondition {
  const spec = specFor(field);
  const operator = spec.operators[0] ?? 'eq';
  return { field, operator, value: defaultValue(spec, operator) };
}

function defaultValue(spec: FieldSpec, operator: FilterOperator): unknown {
  if (operator === 'isNull' || operator === 'isEmpty') return null;
  switch (spec.valueKind) {
    case 'priority':
      return 'URGENT' satisfies Priority;
    case 'statusCategory':
      return STATUS_CATEGORIES[0];
    case 'bool':
      return true;
    case 'date':
      return '';
    default:
      return '';
  }
}

// ── AST compilation (filter-dsl.md) ─────────────────────────────────────────────────────────

/** UTF-8-safe base64 of a JSON value (mirrors the server's `Buffer.from(b64,'base64')`). */
export function encodeFilter(node: FilterNode): string {
  const json = JSON.stringify(node);
  // btoa handles only Latin-1; round-trip through encodeURIComponent for full UTF-8 safety.
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** A label condition's `value` is an array of ids; others carry a scalar. Normalize for the AST. */
function toAstCondition(c: FilterCondition): FilterCondition {
  const spec = specFor(c.field);
  if (c.operator === 'isNull' || c.operator === 'isEmpty') {
    return { field: c.field, operator: c.operator, value: null };
  }
  if (c.operator === 'in' || c.operator === 'nin') {
    const raw = typeof c.value === 'string' ? c.value : '';
    const arr = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { field: c.field, operator: c.operator, value: arr };
  }
  if (spec.valueKind === 'bool') {
    return { field: c.field, operator: c.operator, value: c.value === true || c.value === 'true' };
  }
  return { field: c.field, operator: c.operator, value: c.value };
}

/** Build the compound filter AST from the bar's conditions, or `undefined` if empty. */
export function buildFilterAst(value: FilterBarValue): FilterGroup | undefined {
  if (value.conditions.length === 0) return undefined;
  return { op: value.op, conditions: value.conditions.map(toAstCondition) };
}

/** Serialize the multi-key sort to the `-priority,due_date` wire form (filter-dsl.md). */
export function encodeSort(sort: SortKey[]): string | undefined {
  if (sort.length === 0) return undefined;
  return sort.map((k) => `${k.dir === 'desc' ? '-' : ''}${snake(k.field)}`).join(',');
}

function snake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Compile the bar's value into the `WorkItemQuery` consumed by `listAllWorkItems`. */
export function buildWorkItemQuery(value: FilterBarValue, projectId?: string): WorkItemQuery {
  if (value.smart) {
    // A smart view is the live, code-defined set; it ignores the compound filter (D7).
    return {
      projectId,
      smart: value.smart,
      group: value.group || undefined,
      sort: encodeSort(value.sort),
    };
  }
  const ast = buildFilterAst(value);
  return {
    projectId,
    filter: ast ? encodeFilter(ast) : undefined,
    group: value.group || undefined,
    sort: encodeSort(value.sort),
  };
}

// ── Component ────────────────────────────────────────────────────────────────────────────────

export interface FilterBarProps {
  /** Controlled value; defaults to {@link EMPTY_FILTER_BAR_VALUE} when omitted (uncontrolled). */
  value?: FilterBarValue;
  /** Emitted on every change (typed). */
  onChange?: (value: FilterBarValue) => void;
  /** Emitted with the compiled query (base64 filter / smart / sort / group) for the page to read. */
  onQueryChange?: (query: WorkItemQuery) => void;
  /** The project this bar filters within (scopes saved views + the read). */
  projectId?: string;
  /** Persist a saved view. The bar builds the `SaveView`-shaped payload; the host does the POST. */
  onSaveView?: (input: SaveViewInput) => Promise<void> | void;
}

/** The shape the bar hands to `onSaveView` (a `@rytask/contracts` `SaveView`, kind LIST). */
export interface SaveViewInput {
  name: string;
  kind: 'LIST' | 'BOARD';
  scope: 'PERSONAL' | 'SHARED';
  projectId?: string | null;
  filters?: Record<string, unknown>;
  grouping?: Record<string, unknown> | null;
  sort?: Array<Record<string, unknown>>;
}

export function FilterBar({
  value: controlled,
  onChange,
  onQueryChange,
  projectId,
  onSaveView,
}: FilterBarProps) {
  const [internal, setInternal] = useState<FilterBarValue>(EMPTY_FILTER_BAR_VALUE);
  const value = controlled ?? internal;

  const baseId = useId();
  const [viewName, setViewName] = useState('');
  const [viewScope, setViewScope] = useState<'PERSONAL' | 'SHARED'>('PERSONAL');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const emit = useCallback(
    (next: FilterBarValue) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
      onQueryChange?.(buildWorkItemQuery(next, projectId));
    },
    [controlled, onChange, onQueryChange, projectId],
  );

  const update = useCallback(
    (patch: Partial<FilterBarValue>) => emit({ ...value, ...patch }),
    [emit, value],
  );

  // ── smart-view switcher ─────────────────────────────────────────────────────────────────
  const setSmart = (smart: SmartView) => update({ smart });

  // ── conditions ──────────────────────────────────────────────────────────────────────────
  const addCondition = () =>
    update({ smart: '', conditions: [...value.conditions, newCondition('priority')] });

  const removeCondition = (index: number) =>
    update({ conditions: value.conditions.filter((_, i) => i !== index) });

  const setConditionField = (index: number, field: FilterField) =>
    update({
      conditions: value.conditions.map((c, i) => (i === index ? newCondition(field) : c)),
    });

  const setConditionOperator = (index: number, operator: FilterOperator) =>
    update({
      conditions: value.conditions.map((c, i) =>
        i === index ? { ...c, operator, value: defaultValue(specFor(c.field), operator) } : c,
      ),
    });

  const setConditionValue = (index: number, v: unknown) =>
    update({
      conditions: value.conditions.map((c, i) => (i === index ? { ...c, value: v } : c)),
    });

  // ── sort ────────────────────────────────────────────────────────────────────────────────
  const addSort = () => update({ sort: [...value.sort, { field: 'priority', dir: 'desc' }] });

  const removeSort = (index: number) => update({ sort: value.sort.filter((_, i) => i !== index) });

  const setSortField = (index: number, field: SortField) =>
    update({ sort: value.sort.map((k, i) => (i === index ? { ...k, field } : k)) });

  const setSortDir = (index: number, dir: 'asc' | 'desc') =>
    update({ sort: value.sort.map((k, i) => (i === index ? { ...k, dir } : k)) });

  // ── save view ───────────────────────────────────────────────────────────────────────────
  const canSave = viewName.trim().length > 0 && !value.smart && !saving;

  async function submitSaveView(e: React.FormEvent) {
    e.preventDefault();
    const name = viewName.trim();
    if (!name || !onSaveView) return;
    const ast = buildFilterAst(value);
    const input: SaveViewInput = {
      name,
      kind: 'LIST',
      scope: viewScope,
      projectId: projectId ?? null,
      filters: ast ? (ast as unknown as Record<string, unknown>) : {},
      grouping: value.group ? { field: value.group } : null,
      sort: value.sort.map((k) => ({ field: k.field, dir: k.dir })),
    };
    try {
      setSaving(true);
      setSaveError(null);
      await onSaveView(input);
      setViewName('');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save view');
    } finally {
      setSaving(false);
    }
  }

  const activeSummary = useMemo(() => {
    if (value.smart) return SMART_VIEWS.find((s) => s.view === value.smart)?.label ?? value.smart;
    if (value.conditions.length === 0) return 'No filter';
    return `${value.conditions.length} condition${value.conditions.length > 1 ? 's' : ''}`;
  }, [value.smart, value.conditions.length]);

  return (
    <section aria-label="Filter and view controls" data-testid="filter-bar" style={WRAP}>
      {/* Smart-view switcher */}
      <fieldset style={{ ...FIELDSET, ...ROW }} aria-label="Smart views">
        <legend style={LEGEND}>View</legend>
        {SMART_VIEWS.map((s) => (
          <button
            key={s.view || 'all'}
            type="button"
            aria-pressed={value.smart === s.view}
            onClick={() => setSmart(s.view)}
            data-testid={`smart-${s.view || 'all'}`}
            style={value.smart === s.view ? CHIP_ON : CHIP}
          >
            {s.label}
          </button>
        ))}
      </fieldset>

      {/* Compound filter */}
      <fieldset style={FIELDSET} disabled={value.smart !== ''}>
        <legend style={LEGEND}>Filter ({activeSummary})</legend>

        {value.conditions.length > 1 ? (
          <div style={ROW}>
            <label htmlFor={`${baseId}-join`} style={LABEL}>
              Match
            </label>
            <select
              id={`${baseId}-join`}
              value={value.op}
              onChange={(e) => update({ op: e.target.value as 'and' | 'or' })}
            >
              <option value="and">all (AND)</option>
              <option value="or">any (OR)</option>
            </select>
            <span style={LABEL}>of the following:</span>
          </div>
        ) : null}

        <ul style={LIST} aria-label="Filter conditions">
          {value.conditions.map((c, i) => (
            <ConditionRow
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stateless
              key={i}
              idPrefix={`${baseId}-c${i}`}
              condition={c}
              onField={(f) => setConditionField(i, f)}
              onOperator={(o) => setConditionOperator(i, o)}
              onValue={(v) => setConditionValue(i, v)}
              onRemove={() => removeCondition(i)}
            />
          ))}
        </ul>

        <button type="button" onClick={addCondition} data-testid="add-condition">
          + Add condition
        </button>
      </fieldset>

      {/* Group + sort */}
      <div style={ROW}>
        <label htmlFor={`${baseId}-group`} style={LABEL}>
          Group by
        </label>
        <select
          id={`${baseId}-group`}
          value={value.group}
          onChange={(e) => update({ group: e.target.value as GroupField })}
          data-testid="group-select"
        >
          {GROUP_FIELDS.map((g) => (
            <option key={g.field || 'none'} value={g.field}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset style={FIELDSET}>
        <legend style={LEGEND}>Sort</legend>
        <ul style={LIST} aria-label="Sort keys">
          {value.sort.map((k, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: sort keys are positional
              key={i}
              style={ROW}
            >
              <label className="sr-only" htmlFor={`${baseId}-s${i}-field`}>
                Sort field {i + 1}
              </label>
              <select
                id={`${baseId}-s${i}-field`}
                value={k.field}
                onChange={(e) => setSortField(i, e.target.value as SortField)}
              >
                {SORT_FIELDS.map((f) => (
                  <option key={f.field} value={f.field}>
                    {f.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor={`${baseId}-s${i}-dir`}>
                Sort direction {i + 1}
              </label>
              <select
                id={`${baseId}-s${i}-dir`}
                value={k.dir}
                onChange={(e) => setSortDir(i, e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">ascending</option>
                <option value="desc">descending</option>
              </select>
              <button
                type="button"
                onClick={() => removeSort(i)}
                aria-label={`Remove sort key ${i + 1}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addSort} data-testid="add-sort">
          + Add sort key
        </button>
      </fieldset>

      {/* Save view */}
      {onSaveView ? (
        <form onSubmit={submitSaveView} aria-label="Save view" style={ROW}>
          <label htmlFor={`${baseId}-view-name`} style={LABEL}>
            Save view as
          </label>
          <input
            id={`${baseId}-view-name`}
            type="text"
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="e.g. Urgent bugs"
            data-testid="view-name"
          />
          <label className="sr-only" htmlFor={`${baseId}-view-scope`}>
            View scope
          </label>
          <select
            id={`${baseId}-view-scope`}
            value={viewScope}
            onChange={(e) => setViewScope(e.target.value as 'PERSONAL' | 'SHARED')}
          >
            <option value="PERSONAL">Personal</option>
            <option value="SHARED">Shared</option>
          </select>
          <button type="submit" disabled={!canSave} data-testid="save-view">
            {saving ? 'Saving…' : 'Save view'}
          </button>
          {value.smart ? <small>Clear the smart view to save a custom filter.</small> : null}
        </form>
      ) : null}

      {saveError ? <p role="alert">{saveError}</p> : null}
    </section>
  );
}

// ── Condition row ──────────────────────────────────────────────────────────────────────────

function ConditionRow({
  idPrefix,
  condition,
  onField,
  onOperator,
  onValue,
  onRemove,
}: {
  idPrefix: string;
  condition: FilterCondition;
  onField: (field: FilterField) => void;
  onOperator: (operator: FilterOperator) => void;
  onValue: (value: unknown) => void;
  onRemove: () => void;
}) {
  const spec = specFor(condition.field);
  const noValue = condition.operator === 'isNull' || condition.operator === 'isEmpty';

  return (
    <li style={ROW} data-testid="condition-row">
      <label className="sr-only" htmlFor={`${idPrefix}-field`}>
        Field
      </label>
      <select
        id={`${idPrefix}-field`}
        value={condition.field}
        onChange={(e) => onField(e.target.value as FilterField)}
      >
        {FIELD_SPECS.map((s) => (
          <option key={s.field} value={s.field}>
            {s.label}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`${idPrefix}-op`}>
        Operator
      </label>
      <select
        id={`${idPrefix}-op`}
        value={condition.operator}
        onChange={(e) => onOperator(e.target.value as FilterOperator)}
      >
        {spec.operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>

      {noValue ? null : (
        <ConditionValue idPrefix={idPrefix} spec={spec} value={condition.value} onValue={onValue} />
      )}

      <button type="button" onClick={onRemove} aria-label="Remove condition">
        ✕
      </button>
    </li>
  );
}

function ConditionValue({
  idPrefix,
  spec,
  value,
  onValue,
}: {
  idPrefix: string;
  spec: FieldSpec;
  value: unknown;
  onValue: (value: unknown) => void;
}) {
  const id = `${idPrefix}-value`;
  const labelled = (control: React.ReactNode) => (
    <>
      <label className="sr-only" htmlFor={id}>
        Value
      </label>
      {control}
    </>
  );

  switch (spec.valueKind) {
    case 'priority':
      return labelled(
        <select
          id={id}
          value={typeof value === 'string' ? value : 'URGENT'}
          onChange={(e) => onValue(e.target.value)}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>,
      );
    case 'statusCategory':
      return labelled(
        <select
          id={id}
          value={typeof value === 'string' ? value : STATUS_CATEGORIES[0]}
          onChange={(e) => onValue(e.target.value)}
        >
          {STATUS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>,
      );
    case 'bool':
      return labelled(
        <select
          id={id}
          value={value === true || value === 'true' ? 'true' : 'false'}
          onChange={(e) => onValue(e.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>,
      );
    case 'date':
      return labelled(
        <input
          id={id}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
        />,
      );
    default:
      return labelled(
        <input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onValue(e.target.value)}
          placeholder="value (comma-separate ids for is any of)"
        />,
      );
  }
}

// ── Inline styles (mirrors the existing client components' inline-style approach) ────────────

const WRAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  padding: '0.75rem',
  border: '1px solid #e3e5e8',
  borderRadius: 8,
  marginBottom: '1rem',
};
const ROW: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'center',
  flexWrap: 'wrap',
  listStyle: 'none',
  margin: 0,
};
const LIST: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  listStyle: 'none',
  margin: '0.5rem 0',
  padding: 0,
};
const FIELDSET: React.CSSProperties = { border: '1px solid #e3e5e8', borderRadius: 6, margin: 0 };
const LEGEND: React.CSSProperties = { fontSize: '0.85rem', fontWeight: 600, padding: '0 0.25rem' };
const LABEL: React.CSSProperties = { fontSize: '0.85rem', color: '#444' };
const CHIP: React.CSSProperties = {
  border: '1px solid #d9dce0',
  background: '#fff',
  borderRadius: 999,
  padding: '0.25rem 0.625rem',
  cursor: 'pointer',
  font: 'inherit',
};
const CHIP_ON: React.CSSProperties = {
  ...CHIP,
  background: '#2563eb',
  color: '#fff',
  borderColor: '#2563eb',
};
