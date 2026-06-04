'use client';

import {
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type FilterNode,
  type FilterOperator,
  type SortSpec,
  encodeFilterAst,
  encodeSortSpec,
} from '@/lib/views/view-config';
import { PRIORITIES, type Priority, STATUS_CATEGORIES } from '@rytask/contracts';
import { X } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';

/**
 * Filter bar (US7, T068, FR-WEB-040/041/042/043). One token-only control surface that drives the
 * List and Board reads through the single query engine (filter-dsl.md, D14):
 *   - a **compound** filter — nested AND/OR groups (the spec's `priority = Urgent AND (label = bug
 *     OR overdue)` shape is buildable, FR-WEB-040);
 *   - a **multi-key** sort (priority sorts URGENT→NONE via `desc`) + a single group field (FR-WEB-041);
 *   - a save-view affordance → POST /views (FR-WEB-042);
 *   - an always-present **smart-view** switcher (My Issues / Due Soon / Overdue / Urgent) →
 *     `GET /work-items?smart=…`, server-resolved live (FR-WEB-043, D7).
 *
 * The Filter AST + serializers live in `lib/views/view-config.ts` (the single source the round-trip
 * test covers, T065); this component only *builds* the AST and emits a compiled {@link WorkItemQuery}.
 * It offers only the operators a field's type allows (an invalid combo is rejected `400` server-side
 * as a backstop). Fully keyboard-accessible (labelled controls, a `<fieldset>`/`<legend>` per group)
 * for axe, and token-only (semantic `var(--*)`, lucide icons — never raw hex or emoji chrome).
 */

// ── Re-exported AST types (single source: view-config.ts) ──
export type { FilterField, FilterOperator, FilterCondition, FilterGroup, FilterNode };

/** A sort key (multi-key, FR-WEB-041). `priority desc` is URGENT→NONE by ordinal. */
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
  /** The root compound group (nested AND/OR — FR-WEB-040). */
  filter: FilterGroup;
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

const emptyRoot = (): FilterGroup => ({ op: 'and', conditions: [] });

export const EMPTY_FILTER_BAR_VALUE: FilterBarValue = {
  smart: '',
  filter: emptyRoot(),
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
  between: 'between',
  contains: 'contains',
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

function isGroup(node: FilterNode): node is FilterGroup {
  return 'op' in node;
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
    default:
      return '';
  }
}

/** A fresh leaf condition with a valid operator/value for `field`. */
function newCondition(field: FilterField): FilterCondition {
  const spec = specFor(field);
  const operator = spec.operators[0] ?? 'eq';
  return { field, operator, value: defaultValue(spec, operator) };
}

// ── AST normalization → compiled query (filter-dsl.md) ─────────────────────────────────────

/** A label `in`/`nin` value is an array of ids; `isNull`/`isEmpty` carry no value; others a scalar. */
function normalizeCondition(c: FilterCondition): FilterCondition {
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

/** Normalize a node, dropping empty sub-groups; returns `undefined` for an empty group. */
function normalizeNode(node: FilterNode): FilterNode | undefined {
  if (!isGroup(node)) return normalizeCondition(node);
  const conditions = node.conditions
    .map(normalizeNode)
    .filter((n): n is FilterNode => n !== undefined);
  if (conditions.length === 0) return undefined;
  return { op: node.op, conditions };
}

/** Build the compound filter AST from the bar's root group, or `undefined` if empty. */
export function buildFilterAst(value: FilterBarValue): FilterGroup | undefined {
  const normalized = normalizeNode(value.filter);
  if (!normalized || !isGroup(normalized)) {
    // A single bare condition is wrapped so the wire form is always a group (server expects a node).
    return normalized ? { op: 'and', conditions: [normalized] } : undefined;
  }
  return normalized;
}

/** Compile the bar's value into the `WorkItemQuery` consumed by `listAllWorkItems`. */
export function buildWorkItemQuery(value: FilterBarValue, projectId?: string): WorkItemQuery {
  const sort = encodeSortSpec(value.sort as SortSpec[]);
  if (value.smart) {
    // A smart view is the live, code-defined set; it ignores the compound filter (D7).
    return { projectId, smart: value.smart, group: value.group || undefined, sort };
  }
  const ast = buildFilterAst(value);
  return {
    projectId,
    filter: ast ? encodeFilterAst(ast) : undefined,
    group: value.group || undefined,
    sort,
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
    const n = value.filter.conditions.length;
    if (n === 0) return 'No filter';
    return `${n} condition${n > 1 ? 's' : ''}`;
  }, [value.smart, value.filter.conditions.length]);

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

      {/* Compound filter (nested AND/OR) */}
      <fieldset style={FIELDSET} disabled={value.smart !== ''}>
        <legend style={LEGEND}>Filter ({activeSummary})</legend>
        <GroupEditor
          group={value.filter}
          idPrefix={`${baseId}-root`}
          depth={0}
          onChange={(filter) => update({ filter })}
        />
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
          style={CONTROL}
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
                style={CONTROL}
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
                style={CONTROL}
              >
                <option value="asc">ascending</option>
                <option value="desc">descending</option>
              </select>
              <IconButton label={`Remove sort key ${i + 1}`} onClick={() => removeSort(i)} />
            </li>
          ))}
        </ul>
        <button type="button" onClick={addSort} data-testid="add-sort" style={GHOST_BUTTON}>
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
            style={CONTROL}
          />
          <label className="sr-only" htmlFor={`${baseId}-view-scope`}>
            View scope
          </label>
          <select
            id={`${baseId}-view-scope`}
            value={viewScope}
            onChange={(e) => setViewScope(e.target.value as 'PERSONAL' | 'SHARED')}
            style={CONTROL}
          >
            <option value="PERSONAL">Personal</option>
            <option value="SHARED">Shared</option>
          </select>
          <button type="submit" disabled={!canSave} data-testid="save-view" style={ADD_BUTTON}>
            {saving ? 'Saving…' : 'Save view'}
          </button>
          {value.smart ? (
            <small style={{ color: 'var(--fg-muted)' }}>
              Clear the smart view to save a custom filter.
            </small>
          ) : null}
        </form>
      ) : null}

      {saveError ? (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {saveError}
        </p>
      ) : null}
    </section>
  );
}

// ── Group editor (recursive: conditions + nested sub-groups, FR-WEB-040) ─────────────────────

function GroupEditor({
  group,
  idPrefix,
  depth,
  onChange,
  onRemove,
}: {
  group: FilterGroup;
  idPrefix: string;
  depth: number;
  onChange: (group: FilterGroup) => void;
  onRemove?: () => void;
}) {
  const setOp = (op: 'and' | 'or') => onChange({ ...group, op });
  const setChild = (index: number, node: FilterNode) =>
    onChange({ ...group, conditions: group.conditions.map((c, i) => (i === index ? node : c)) });
  const removeChild = (index: number) =>
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) });
  const addCondition = () =>
    onChange({ ...group, conditions: [...group.conditions, newCondition('priority')] });
  const addGroup = () =>
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { op: group.op === 'and' ? 'or' : 'and', conditions: [newCondition('priority')] },
      ],
    });

  return (
    <div
      style={depth > 0 ? NESTED_GROUP : undefined}
      data-testid={depth > 0 ? 'filter-group' : undefined}
    >
      <div style={ROW}>
        {group.conditions.length > 1 ? (
          <>
            <label htmlFor={`${idPrefix}-join`} style={LABEL}>
              Match
            </label>
            <select
              id={`${idPrefix}-join`}
              value={group.op}
              onChange={(e) => setOp(e.target.value as 'and' | 'or')}
              style={CONTROL}
            >
              <option value="and">all (AND)</option>
              <option value="or">any (OR)</option>
            </select>
            <span style={LABEL}>of:</span>
          </>
        ) : null}
        {onRemove ? <IconButton label="Remove group" onClick={onRemove} /> : null}
      </div>

      <ul style={LIST} aria-label="Filter conditions">
        {group.conditions.map((child, i) =>
          isGroup(child) ? (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: nodes are positional and stateless
              key={i}
              style={{ listStyle: 'none' }}
            >
              <GroupEditor
                group={child}
                idPrefix={`${idPrefix}-g${i}`}
                depth={depth + 1}
                onChange={(node) => setChild(i, node)}
                onRemove={() => removeChild(i)}
              />
            </li>
          ) : (
            <ConditionRow
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and stateless
              key={i}
              idPrefix={`${idPrefix}-c${i}`}
              condition={child}
              onChange={(c) => setChild(i, c)}
              onRemove={() => removeChild(i)}
            />
          ),
        )}
      </ul>

      <div style={ROW}>
        <button
          type="button"
          onClick={addCondition}
          data-testid={depth === 0 ? 'add-condition' : undefined}
          style={GHOST_BUTTON}
        >
          + Add condition
        </button>
        <button
          type="button"
          onClick={addGroup}
          data-testid={depth === 0 ? 'add-group' : undefined}
          style={GHOST_BUTTON}
        >
          + Add group
        </button>
      </div>
    </div>
  );
}

// ── Condition row ──────────────────────────────────────────────────────────────────────────

function ConditionRow({
  idPrefix,
  condition,
  onChange,
  onRemove,
}: {
  idPrefix: string;
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
}) {
  const spec = specFor(condition.field);
  const noValue = condition.operator === 'isNull' || condition.operator === 'isEmpty';

  const onField = (field: FilterField) => onChange(newCondition(field));
  const onOperator = (operator: FilterOperator) =>
    onChange({ ...condition, operator, value: defaultValue(specFor(condition.field), operator) });
  const onValue = (value: unknown) => onChange({ ...condition, value });

  return (
    <li style={ROW} data-testid="condition-row">
      <label className="sr-only" htmlFor={`${idPrefix}-field`}>
        Field
      </label>
      <select
        id={`${idPrefix}-field`}
        value={condition.field}
        onChange={(e) => onField(e.target.value as FilterField)}
        style={CONTROL}
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
        style={CONTROL}
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

      <IconButton label="Remove condition" onClick={onRemove} />
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
          style={CONTROL}
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
          style={CONTROL}
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
          style={CONTROL}
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
          style={{ ...CONTROL, fontFamily: 'var(--font-mono)' }}
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
          style={CONTROL}
        />,
      );
  }
}

/** A small icon-only button (lucide X) used for remove affordances — never an emoji glyph. */
function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} style={ICON_BUTTON}>
      <X size={16} aria-hidden="true" />
    </button>
  );
}

// ── Token-only inline styles ─────────────────────────────────────────────────────────────────

const WRAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-3)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  marginBottom: 'var(--space-4)',
};
const ROW: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'center',
  flexWrap: 'wrap',
  listStyle: 'none',
  margin: 0,
};
const LIST: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 'var(--space-2) 0',
  padding: 0,
};
const FIELDSET: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  margin: 0,
  padding: 'var(--space-2) var(--space-3)',
};
const NESTED_GROUP: React.CSSProperties = {
  borderLeft: '2px solid var(--border-subtle)',
  paddingLeft: 'var(--space-3)',
  marginLeft: 'var(--space-2)',
};
const LEGEND: React.CSSProperties = {
  fontSize: 'var(--fs-micro)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 'var(--w-medium)',
  color: 'var(--fg-muted)',
  padding: '0 var(--space-1)',
};
const LABEL: React.CSSProperties = { fontSize: 'var(--fs-sm)', color: 'var(--fg-muted)' };
const CONTROL: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
};
const CHIP: React.CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  borderRadius: 'var(--radius-pill)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
  font: 'inherit',
};
const CHIP_ON: React.CSSProperties = {
  ...CHIP,
  background: 'var(--primary-soft)',
  color: 'var(--primary-soft-fg)',
  borderColor: 'var(--primary-border)',
};
const GHOST_BUTTON: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg)',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
};
const ADD_BUTTON: React.CSSProperties = {
  font: 'inherit',
  color: 'var(--fg-on-accent)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-3)',
  cursor: 'pointer',
};
const ICON_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg-muted)',
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1)',
  cursor: 'pointer',
};
