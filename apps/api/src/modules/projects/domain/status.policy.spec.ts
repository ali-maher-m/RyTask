import { describe, expect, it } from 'vitest';
import {
  evaluateStatusDelete,
  isClosedCategory,
  isCompletedCategory,
  isValidCategory,
} from './status.policy';

/**
 * Status policy unit tests (T046, FR-WF-002): a project keeps ≥1 status; deleting a
 * status with items requires a valid `reassignTo`; the category mapping rules.
 */

const OTHERS = ['s-todo', 's-done'];

describe('evaluateStatusDelete', () => {
  it('refuses to delete the last remaining status (min-one)', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 1,
      itemCount: 0,
      statusId: 's-only',
      otherStatusIds: [],
    });
    expect(r).toEqual({ ok: false, reason: 'LAST_STATUS' });
  });

  it('allows deleting an empty status when others remain', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 0,
      statusId: 's-x',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: true });
  });

  it('requires reassignTo when the status still has items', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 4,
      statusId: 's-x',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: false, reason: 'HAS_ITEMS_NEEDS_REASSIGN' });
  });

  it('allows deleting a status with items when a valid reassignTo is given', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 4,
      statusId: 's-x',
      reassignTo: 's-todo',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: true });
  });

  it('rejects reassignTo pointing at the status being deleted', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 4,
      statusId: 's-x',
      reassignTo: 's-x',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: false, reason: 'REASSIGN_SAME' });
  });

  it('rejects reassignTo that is not a status in the project', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 4,
      statusId: 's-x',
      reassignTo: 's-elsewhere',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: false, reason: 'REASSIGN_UNKNOWN' });
  });

  it('validates a reassignTo named for an EMPTY status too (REASSIGN_SAME)', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 0,
      statusId: 's-x',
      reassignTo: 's-x',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: false, reason: 'REASSIGN_SAME' });
  });

  it('rejects an unknown reassignTo for an EMPTY status (REASSIGN_UNKNOWN)', () => {
    const r = evaluateStatusDelete({
      totalStatuses: 3,
      itemCount: 0,
      statusId: 's-x',
      reassignTo: 's-elsewhere',
      otherStatusIds: OTHERS,
    });
    expect(r).toEqual({ ok: false, reason: 'REASSIGN_UNKNOWN' });
  });
});

describe('category mapping', () => {
  it('recognizes the five fixed categories and nothing else', () => {
    for (const c of ['BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELLED']) {
      expect(isValidCategory(c)).toBe(true);
    }
    expect(isValidCategory('DONE')).toBe(false);
    expect(isValidCategory('')).toBe(false);
  });

  it('COMPLETED is the only completed category; COMPLETED+CANCELLED are closed', () => {
    expect(isCompletedCategory('COMPLETED')).toBe(true);
    expect(isCompletedCategory('CANCELLED')).toBe(false);
    expect(isCompletedCategory('STARTED')).toBe(false);
    expect(isCompletedCategory(null)).toBe(false);

    expect(isClosedCategory('COMPLETED')).toBe(true);
    expect(isClosedCategory('CANCELLED')).toBe(true);
    expect(isClosedCategory('STARTED')).toBe(false);
    expect(isClosedCategory(undefined)).toBe(false);
  });
});
