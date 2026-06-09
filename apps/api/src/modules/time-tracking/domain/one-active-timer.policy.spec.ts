import { describe, expect, it } from 'vitest';
import { type RunningTimer, decideStart, elapsedSeconds } from './one-active-timer.policy';

/**
 * Unit test for the one-active-timer policy (T017, time-tracking-flow.md §1). Pure: asserts the
 * switch-vs-start-vs-noop decision and the finalize shape (the duration a switch records) without
 * any DB. The DB-level concurrency guard (UNIQUE(org,user)) is covered by the integration tests.
 */
const ITEM_A = '0193b3a0-0000-7000-8000-0000000000a1';
const ITEM_B = '0193b3a0-0000-7000-8000-0000000000b2';
const NOW = new Date('2026-06-09T12:00:00.000Z');

const running = (workItemId: string, startedAt: Date): RunningTimer => ({
  id: 'timer-1',
  workItemId,
  startedAt,
});

describe('decideStart', () => {
  it('idle (no current timer) → start', () => {
    expect(decideStart(null, ITEM_A, NOW)).toEqual({ kind: 'start' });
  });

  it('already running on the SAME item → noop (no second entry, elapsed not reset)', () => {
    const current = running(ITEM_A, new Date('2026-06-09T11:30:00.000Z'));
    expect(decideStart(current, ITEM_A, NOW)).toEqual({ kind: 'noop' });
  });

  it('running on ANOTHER item → switch, finalizing the prior accrual', () => {
    const current = running(ITEM_A, new Date('2026-06-09T11:30:00.000Z')); // 30m ago
    const decision = decideStart(current, ITEM_B, NOW);
    expect(decision).toEqual({
      kind: 'switch',
      finalize: {
        timerId: 'timer-1',
        workItemId: ITEM_A,
        startedAt: new Date('2026-06-09T11:30:00.000Z'),
        durationSeconds: 1800,
      },
    });
  });
});

describe('elapsedSeconds', () => {
  it('rounds to whole seconds', () => {
    expect(elapsedSeconds(new Date('2026-06-09T11:59:59.400Z'), NOW)).toBe(1);
    expect(elapsedSeconds(new Date('2026-06-09T11:58:30.000Z'), NOW)).toBe(90);
  });

  it('never returns less than 1 (a finalized entry is always > 0)', () => {
    expect(elapsedSeconds(NOW, NOW)).toBe(1);
    // A clock that appears to go backwards still floors to 1, never zero/negative.
    expect(elapsedSeconds(new Date('2026-06-09T12:00:01.000Z'), NOW)).toBe(1);
  });
});
