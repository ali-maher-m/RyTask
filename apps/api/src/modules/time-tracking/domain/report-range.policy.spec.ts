import { describe, expect, it } from 'vitest';
import {
  MAX_RANGE_DAYS,
  isMonday,
  isoWeekStart,
  validateRange,
  validateWeekStart,
  weekEndOf,
  weekStartsInRange,
} from './report-range.policy';

/**
 * Unit tests for the pure M4 report date helpers (T003, research D5): inclusive-range validation,
 * the 366-day max-span bound, the Monday check, and the ISO-week-list generator. All UTC, all
 * `YYYY-MM-DD`, identical to M2's `date_trunc('week', …)` bucketing — no I/O, no `new Date()` of the
 * caller's own (every input is an explicit calendar string).
 */
describe('report-range.policy', () => {
  describe('validateRange', () => {
    it('accepts an inclusive range with from <= to', () => {
      expect(validateRange('2026-06-01', '2026-06-07')).toEqual({ ok: true });
      expect(validateRange('2026-06-01', '2026-06-01')).toEqual({ ok: true }); // single day
    });

    it('rejects from > to with a plain-language message', () => {
      const r = validateRange('2026-06-08', '2026-06-01');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/start.*before|after/i);
    });

    it('rejects a span longer than the 366-day bound', () => {
      // 2026-01-01 .. 2027-01-02 is 367 inclusive days.
      const r = validateRange('2026-01-01', '2027-01-02');
      expect(r.ok).toBe(false);
      expect(MAX_RANGE_DAYS).toBe(366);
    });

    it('accepts a span exactly at the 366-day bound', () => {
      // 2026-01-01 .. 2026-12-31 is 365 inclusive days; +1 day = 366.
      expect(validateRange('2026-01-01', '2027-01-01')).toEqual({ ok: true });
    });

    it('rejects an impossible calendar date that passes the YYYY-MM-DD regex', () => {
      expect(validateRange('2026-02-30', '2026-03-01').ok).toBe(false);
      expect(validateRange('2026-01-01', '2026-13-01').ok).toBe(false);
    });
  });

  describe('isMonday / validateWeekStart', () => {
    it('recognizes a Monday (UTC)', () => {
      expect(isMonday('2026-06-08')).toBe(true); // a Monday
      expect(isMonday('2026-06-09')).toBe(false); // Tuesday
      expect(isMonday('2026-06-07')).toBe(false); // Sunday
    });

    it('validateWeekStart accepts a Monday and rejects any other day', () => {
      expect(validateWeekStart('2026-06-08')).toEqual({ ok: true });
      const r = validateWeekStart('2026-06-09');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/monday/i);
    });
  });

  describe('isoWeekStart / weekEndOf', () => {
    it('maps any day to the Monday of its ISO week (UTC, Monday-keyed)', () => {
      expect(isoWeekStart('2026-06-08')).toBe('2026-06-08'); // Monday → itself
      expect(isoWeekStart('2026-06-10')).toBe('2026-06-08'); // Wednesday → Monday
      expect(isoWeekStart('2026-06-14')).toBe('2026-06-08'); // Sunday → that week's Monday
      expect(isoWeekStart('2026-06-15')).toBe('2026-06-15'); // next Monday
    });

    it('weekEndOf returns the Sunday six days after the Monday', () => {
      expect(weekEndOf('2026-06-08')).toBe('2026-06-14');
    });
  });

  describe('weekStartsInRange', () => {
    it('lists every ISO week Monday intersecting the range, ascending, including empty weeks', () => {
      // 2026-06-03 (Wed) .. 2026-06-16 (Tue) spans three ISO weeks.
      expect(weekStartsInRange('2026-06-03', '2026-06-16')).toEqual([
        '2026-06-01',
        '2026-06-08',
        '2026-06-15',
      ]);
    });

    it('returns a single week when from and to share an ISO week', () => {
      expect(weekStartsInRange('2026-06-09', '2026-06-12')).toEqual(['2026-06-08']);
    });

    it('keys the week by its Monday even when the range starts mid-week', () => {
      expect(weekStartsInRange('2026-06-14', '2026-06-14')).toEqual(['2026-06-08']); // a Sunday
    });
  });
});
