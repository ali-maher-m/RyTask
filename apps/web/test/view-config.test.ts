import {
  type FilterGroup,
  type ViewSpec,
  decodeFilterAst,
  deserializeViewSpec,
  encodeFilterAst,
  savedViewToViewSpec,
  serializeViewSpec,
  viewSpecToWorkItemQuery,
} from '@/lib/views/view-config';
import { describe, expect, it } from 'vitest';

/**
 * ViewSpec round-trip (US7, T065, contracts/view-config.md). The client builds the M1 Filter AST and
 * serializes it (base64 JSON) + multi-key sort + group; the server compiles and evaluates it. These
 * cases pin the **round-trip invariant**: `deserialize(serialize(cfg))` is structurally equal to `cfg`
 * for every supported field/operator/value — including the nested compound case from filter-dsl.md
 * (`priority = Urgent AND (label = bug OR overdue)`) — so saved/smart views and Board↔List carry-over
 * all restore identically over one query path.
 */

/** The spec's compound case: `priority = Urgent AND (label = bug OR overdue)`. */
const COMPOUND_FILTER: FilterGroup = {
  op: 'and',
  conditions: [
    { field: 'priority', operator: 'eq', value: 'URGENT' },
    {
      op: 'or',
      conditions: [
        { field: 'label', operator: 'in', value: ['bug-label-id'] },
        { field: 'overdue', operator: 'eq', value: true },
      ],
    },
  ],
};

describe('Filter AST base64 codec', () => {
  it('round-trips the nested compound AST exactly', () => {
    expect(decodeFilterAst(encodeFilterAst(COMPOUND_FILTER))).toEqual(COMPOUND_FILTER);
  });

  it('survives multi-byte values (UTF-8 safe)', () => {
    const filter: FilterGroup = {
      op: 'and',
      conditions: [{ field: 'text', operator: 'contains', value: 'café — naïve ☃ 日本語' }],
    };
    expect(decodeFilterAst(encodeFilterAst(filter))).toEqual(filter);
  });

  it('returns undefined for absent or garbled input', () => {
    expect(decodeFilterAst(null)).toBeUndefined();
    expect(decodeFilterAst('')).toBeUndefined();
    expect(decodeFilterAst('not-valid-base64-json!!')).toBeUndefined();
  });
});

describe('serializeViewSpec / deserializeViewSpec', () => {
  it('round-trips a full list spec (nested filter + multi-key sort + group)', () => {
    const cfg: ViewSpec = {
      layout: 'list',
      filter: COMPOUND_FILTER,
      sort: [
        { field: 'priority', dir: 'desc' },
        { field: 'dueDate', dir: 'asc' },
      ],
      group: 'assignee',
      scope: 'shared',
      name: 'Urgent bugs',
    };
    expect(deserializeViewSpec(serializeViewSpec(cfg))).toEqual(cfg);
  });

  it('round-trips a board layout with a bare top-level group', () => {
    const cfg: ViewSpec = {
      layout: 'board',
      filter: { op: 'and', conditions: [{ field: 'priority', operator: 'eq', value: 'HIGH' }] },
    };
    expect(deserializeViewSpec(serializeViewSpec(cfg))).toEqual(cfg);
  });

  it('round-trips a smart view (filter ignored when smart is set)', () => {
    const cfg: ViewSpec = { layout: 'list', smart: 'overdue', group: 'status' };
    const back = deserializeViewSpec(serializeViewSpec(cfg));
    expect(back).toEqual(cfg);
    expect(back.filter).toBeUndefined();
  });

  it('produces a stable, sorted query string for the same spec', () => {
    const cfg: ViewSpec = { layout: 'list', smart: 'urgent', group: 'priority' };
    expect(serializeViewSpec(cfg).toString()).toBe(serializeViewSpec(cfg).toString());
  });

  it('orders the priority sort key URGENT→NONE via `desc` (FR-WEB-041)', () => {
    const cfg: ViewSpec = { layout: 'list', sort: [{ field: 'priority', dir: 'desc' }] };
    expect(serializeViewSpec(cfg).get('sort')).toBe('-priority');
  });
});

describe('viewSpecToWorkItemQuery', () => {
  it('compiles a filter spec to the base64 `filter` wire query', () => {
    const q = viewSpecToWorkItemQuery({ layout: 'list', filter: COMPOUND_FILTER }, 'proj-1');
    expect(q.projectId).toBe('proj-1');
    expect(decodeFilterAst(q.filter)).toEqual(COMPOUND_FILTER);
    expect(q.smart).toBeUndefined();
  });

  it('compiles a smart spec to `smart` and drops the filter', () => {
    const q = viewSpecToWorkItemQuery(
      { layout: 'list', smart: 'my-issues', filter: COMPOUND_FILTER },
      'proj-1',
    );
    expect(q.smart).toBe('my-issues');
    expect(q.filter).toBeUndefined();
  });
});

describe('savedViewToViewSpec', () => {
  it('restores layout, filter, sort, group, scope, and name from a saved row', () => {
    const spec = savedViewToViewSpec({
      kind: 'LIST',
      scope: 'SHARED',
      name: 'Urgent bugs',
      projectId: 'proj-1',
      filters: COMPOUND_FILTER as unknown as Record<string, unknown>,
      grouping: { field: 'assignee' },
      sort: [
        { field: 'priority', dir: 'desc' },
        { field: 'dueDate', dir: 'asc' },
      ],
    });
    expect(spec).toEqual({
      layout: 'list',
      filter: COMPOUND_FILTER,
      sort: [
        { field: 'priority', dir: 'desc' },
        { field: 'dueDate', dir: 'asc' },
      ],
      group: 'assignee',
      scope: 'shared',
      name: 'Urgent bugs',
    });
  });

  it('treats an empty stored filter as no filter', () => {
    const spec = savedViewToViewSpec({
      kind: 'BOARD',
      scope: 'PERSONAL',
      name: 'Mine',
      projectId: null,
      filters: {},
      grouping: null,
      sort: [],
    });
    expect(spec.filter).toBeUndefined();
    expect(spec.layout).toBe('board');
    expect(spec.scope).toBe('personal');
  });
});
