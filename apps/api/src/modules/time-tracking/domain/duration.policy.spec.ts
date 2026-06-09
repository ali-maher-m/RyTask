import { describe, expect, it } from 'vitest';
import { MAX_ENTRY_SECONDS, resolveEntry } from './duration.policy';

/**
 * Unit test for the manual-entry duration policy (T040, time-tracking-flow.md §3). Pure: covers the
 * two accepted forms (duration-only, start/end) and every invalid form — both at once, neither,
 * end ≤ start, zero/negative, and an absurd over-cap span — asserting nothing leaks and the messages
 * are friendly. `now` is injected so the default-day path is deterministic.
 */
const NOW = new Date('2026-06-09T15:30:00.000Z');

describe('resolveEntry (duration policy)', () => {
  it('duration-only: dates by `date` at midnight UTC and derives endedAt = started + duration', () => {
    const r = resolveEntry({ durationSeconds: 3600, date: '2026-06-01' }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.startedAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(r.entry.endedAt.toISOString()).toBe('2026-06-01T01:00:00.000Z');
    expect(r.entry.durationSeconds).toBe(3600);
  });

  it('duration-only without a date defaults to `now`’s day', () => {
    const r = resolveEntry({ durationSeconds: 1800 }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.startedAt.toISOString()).toBe('2026-06-09T00:00:00.000Z');
    expect(r.entry.durationSeconds).toBe(1800);
  });

  it('duration-only honors an explicit anchor (an edit keeping the original start)', () => {
    const anchor = new Date('2026-05-20T09:15:00.000Z');
    const r = resolveEntry({ durationSeconds: 900 }, NOW, anchor);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.startedAt.toISOString()).toBe('2026-05-20T09:15:00.000Z');
    expect(r.entry.endedAt.toISOString()).toBe('2026-05-20T09:30:00.000Z');
  });

  it('start/end: derives durationSeconds from the span', () => {
    const r = resolveEntry(
      { startedAt: '2026-06-09T10:00:00.000Z', endedAt: '2026-06-09T12:00:00.000Z' },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.durationSeconds).toBe(7200);
  });

  it('rejects both forms at once (duration AND start/end)', () => {
    const r = resolveEntry(
      {
        durationSeconds: 60,
        startedAt: '2026-06-09T10:00:00.000Z',
        endedAt: '2026-06-09T10:01:00.000Z',
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/not both/i);
  });

  it('rejects neither form (no duration, no start/end)', () => {
    expect(resolveEntry({ note: 'oops' } as never, NOW).ok).toBe(false);
  });

  it('rejects a start-only / end-only partial', () => {
    expect(resolveEntry({ startedAt: '2026-06-09T10:00:00.000Z' }, NOW).ok).toBe(false);
    expect(resolveEntry({ endedAt: '2026-06-09T10:00:00.000Z' }, NOW).ok).toBe(false);
  });

  it('rejects end ≤ start (zero or negative span)', () => {
    const zero = resolveEntry(
      { startedAt: '2026-06-09T10:00:00.000Z', endedAt: '2026-06-09T10:00:00.000Z' },
      NOW,
    );
    expect(zero.ok).toBe(false);
    const negative = resolveEntry(
      { startedAt: '2026-06-09T12:00:00.000Z', endedAt: '2026-06-09T10:00:00.000Z' },
      NOW,
    );
    expect(negative.ok).toBe(false);
    if (negative.ok) return;
    expect(negative.message).toMatch(/after the start/i);
  });

  it('rejects a zero/negative duration-only value', () => {
    expect(resolveEntry({ durationSeconds: 0 }, NOW).ok).toBe(false);
    expect(resolveEntry({ durationSeconds: -60 }, NOW).ok).toBe(false);
  });

  it('rejects an absurd over-cap span (both forms)', () => {
    expect(resolveEntry({ durationSeconds: MAX_ENTRY_SECONDS + 1 }, NOW).ok).toBe(false);
    const longSpan = resolveEntry(
      { startedAt: '2026-06-09T00:00:00.000Z', endedAt: '2026-06-10T00:00:01.000Z' },
      NOW,
    );
    expect(longSpan.ok).toBe(false);
  });

  it('allows exactly the cap', () => {
    expect(resolveEntry({ durationSeconds: MAX_ENTRY_SECONDS }, NOW).ok).toBe(true);
  });
});
