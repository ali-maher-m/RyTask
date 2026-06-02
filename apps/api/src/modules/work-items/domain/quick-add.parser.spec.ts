import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quick-add.parser';

/**
 * Quick-add inline grammar (T016, FR-WI-004, research D2). Pure parser: `@ # ! ^`
 * tokens → fields; resolution of handles/labels happens later in the provider.
 * Reference date is injected (Clock port) so date parsing is deterministic.
 */
const REF = new Date('2026-05-31T12:00:00.000Z');

describe('parseQuickAdd', () => {
  it('parses every token type and leaves a clean title', () => {
    const r = parseQuickAdd('Fix login redirect @ali #bug !urgent ^2026-07-04', {
      referenceDate: REF,
    });
    expect(r.title).toBe('Fix login redirect');
    expect(r.assignees).toEqual(['ali']);
    expect(r.labels).toEqual(['bug']);
    expect(r.priority).toBe('URGENT');
    expect(r.dueDate).toBe('2026-07-04');
    expect(r.unresolved).toEqual([]);
  });

  it('is case-insensitive for priority', () => {
    expect(parseQuickAdd('x !HIGH', { referenceDate: REF }).priority).toBe('HIGH');
    expect(parseQuickAdd('x !Low', { referenceDate: REF }).priority).toBe('LOW');
  });

  it('resolves natural-language dates via the reference date', () => {
    expect(parseQuickAdd('x ^today', { referenceDate: REF }).dueDate).toBe('2026-05-31');
    expect(parseQuickAdd('x ^tomorrow', { referenceDate: REF }).dueDate).toBe('2026-06-01');
  });

  it('resolves a weekday name to a YYYY-MM-DD date', () => {
    expect(parseQuickAdd('x ^friday', { referenceDate: REF }).dueDate).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('parses a multi-word natural date phrase and keeps the rest as the title', () => {
    const r = parseQuickAdd('Plan offsite ^next Friday', { referenceDate: REF });
    expect(r.title).toBe('Plan offsite');
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.unresolved).toEqual([]);
  });

  it('resolves a relative multi-word date (^in 3 days)', () => {
    const r = parseQuickAdd('Ship ^in 3 days', { referenceDate: REF });
    expect(r.dueDate).toBe('2026-06-03');
    expect(r.title).toBe('Ship');
  });

  it('stops a date phrase at the single token when the rest is title text', () => {
    const r = parseQuickAdd('x ^friday ship it', { referenceDate: REF });
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.title).toBe('x ship it');
  });

  it('does NOT treat mid-word markers as tokens (C#, emails)', () => {
    const r = parseQuickAdd('Learn C# and email foo@bar.com', { referenceDate: REF });
    expect(r.title).toBe('Learn C# and email foo@bar.com');
    expect(r.assignees).toEqual([]);
    expect(r.labels).toEqual([]);
  });

  it('honors backslash escaping for literal markers', () => {
    const r = parseQuickAdd('Ship \\#1 release \\@here', { referenceDate: REF });
    expect(r.title).toBe('Ship #1 release @here');
    expect(r.labels).toEqual([]);
    expect(r.assignees).toEqual([]);
  });

  it('flags an unknown priority instead of dropping it', () => {
    const r = parseQuickAdd('x !soon', { referenceDate: REF });
    expect(r.priority).toBeUndefined();
    expect(r.unresolved).toContainEqual({ token: '!soon', kind: 'priority' });
  });

  it('flags an unparseable date instead of dropping it', () => {
    const r = parseQuickAdd('x ^blurgh', { referenceDate: REF });
    expect(r.dueDate).toBeUndefined();
    expect(r.unresolved).toContainEqual({ token: '^blurgh', kind: 'date' });
  });

  it('collects multiple assignees and labels', () => {
    const r = parseQuickAdd('Task @ali @sam #bug #ui', { referenceDate: REF });
    expect(r.assignees).toEqual(['ali', 'sam']);
    expect(r.labels).toEqual(['bug', 'ui']);
  });
});
