import { describe, expect, it } from 'vitest';
import { isOverdue } from './overdue.policy';

/**
 * Unit test for the overdue policy (T090, FR-DATE-003). Pure: overdue ⇔ dueDate present AND
 * dueDate < today (org tz) AND not in a closed (COMPLETED/CANCELLED) category. No DB / clock.
 *   - no due date → never overdue
 *   - due in the past + open → overdue
 *   - due "today" → NOT overdue (the boundary is strict `<`)
 *   - closed (by category OR by completed_at) → never overdue (clears on completion)
 */
const TODAY = '2026-05-31';

describe('isOverdue', () => {
  it('is false when there is no due date', () => {
    expect(isOverdue({ dueDate: null, today: TODAY })).toBe(false);
  });

  it('is true for a past due date on an open item (by category)', () => {
    expect(isOverdue({ dueDate: '2026-05-30', today: TODAY, statusCategory: 'STARTED' })).toBe(
      true,
    );
  });

  it('is true for a past due date on an open item (by completed_at fallback)', () => {
    expect(isOverdue({ dueDate: '2026-05-30', today: TODAY, completedAt: null })).toBe(true);
  });

  it('is NOT overdue when due exactly today (boundary, strict <)', () => {
    expect(isOverdue({ dueDate: TODAY, today: TODAY, statusCategory: 'STARTED' })).toBe(false);
  });

  it('is false for a future due date', () => {
    expect(isOverdue({ dueDate: '2026-06-15', today: TODAY, statusCategory: 'STARTED' })).toBe(
      false,
    );
  });

  it('clears once the item is COMPLETED, even if the due date is past', () => {
    expect(isOverdue({ dueDate: '2026-05-01', today: TODAY, statusCategory: 'COMPLETED' })).toBe(
      false,
    );
  });

  it('clears for a CANCELLED item, even if the due date is past', () => {
    expect(isOverdue({ dueDate: '2026-05-01', today: TODAY, statusCategory: 'CANCELLED' })).toBe(
      false,
    );
  });

  it('clears via the completed_at fallback when no category is carried', () => {
    expect(
      isOverdue({ dueDate: '2026-05-01', today: TODAY, completedAt: new Date('2026-05-02') }),
    ).toBe(false);
  });
});
