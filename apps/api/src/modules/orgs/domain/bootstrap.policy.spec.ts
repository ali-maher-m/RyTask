import { describe, expect, it } from 'vitest';
import { firstRunAvailable, orgSlug, starterKeyPrefix } from './bootstrap.policy';

describe('bootstrap.policy', () => {
  describe('firstRunAvailable', () => {
    it('is available only when zero orgs exist (FR-AUTH-010, research D7)', () => {
      expect(firstRunAvailable(0)).toBe(true);
      expect(firstRunAvailable(1)).toBe(false);
      expect(firstRunAvailable(5)).toBe(false);
    });
  });

  describe('orgSlug', () => {
    it('lowercases, hyphenates, and trims', () => {
      expect(orgSlug('Acme Inc')).toBe('acme-inc');
      expect(orgSlug('  Hello, World!  ')).toBe('hello-world');
    });

    it('falls back to "org" when empty after cleaning', () => {
      expect(orgSlug('!!!')).toBe('org');
      expect(orgSlug('')).toBe('org');
    });
  });

  describe('starterKeyPrefix', () => {
    it('produces an uppercase prefix matching ^[A-Z][A-Z0-9]{1,9}$', () => {
      const re = /^[A-Z][A-Z0-9]{1,9}$/;
      expect(starterKeyPrefix('Acme')).toBe('ACME');
      expect(re.test(starterKeyPrefix('Acme'))).toBe(true);
      expect(re.test(starterKeyPrefix('Marketing Team'))).toBe(true);
    });

    it('strips leading non-letters and caps length at 5', () => {
      expect(starterKeyPrefix('123 Corp')).toBe('CORP');
      expect(starterKeyPrefix('Wonderful Widgets')).toBe('WONDE');
    });

    it('falls back to TASK when fewer than 2 usable chars', () => {
      expect(starterKeyPrefix('A')).toBe('TASK');
      expect(starterKeyPrefix('___')).toBe('TASK');
    });
  });
});
