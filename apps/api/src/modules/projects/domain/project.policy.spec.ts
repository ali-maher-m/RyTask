import { describe, expect, it } from 'vitest';
import { isValidKeyPrefix, isValidName, validateProject } from './project.policy';

/**
 * Project policy unit tests (T062, FR-PROJ-001): key prefix matches ^[A-Z][A-Z0-9]{1,9}$,
 * name is 1–120 chars. Per-workspace prefix uniqueness is a DB constraint (covered by the
 * create-project integration test), not this pure policy.
 */

describe('isValidKeyPrefix', () => {
  it('accepts an uppercase letter then 1–9 uppercase letters/digits', () => {
    for (const ok of ['RY', 'AB', 'ABC123', 'A1', 'WEB', 'PROJ123456']) {
      expect(isValidKeyPrefix(ok)).toBe(true);
    }
  });

  it('rejects too-short, too-long, lowercase, or non-leading-letter prefixes', () => {
    for (const bad of [
      'A', // too short (needs ≥2 chars)
      'ABCDEFGHIJK', // 11 chars (max is 10)
      'ry', // lowercase
      '1AB', // must start with a letter
      'A-B', // illegal char
      'A B', // space
      '', // empty
    ]) {
      expect(isValidKeyPrefix(bad)).toBe(false);
    }
  });
});

describe('isValidName', () => {
  it('accepts 1–120 chars (trimmed)', () => {
    expect(isValidName('X')).toBe(true);
    expect(isValidName('Marketing')).toBe(true);
    expect(isValidName('A'.repeat(120))).toBe(true);
  });

  it('rejects empty/whitespace-only and >120 chars', () => {
    expect(isValidName('')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('A'.repeat(121))).toBe(false);
  });
});

describe('validateProject', () => {
  it('ok when name + prefix are both valid', () => {
    expect(validateProject({ name: 'Marketing', keyPrefix: 'MKT' })).toEqual({ ok: true });
  });

  it('flags a bad name length', () => {
    expect(validateProject({ name: '', keyPrefix: 'MKT' })).toEqual({
      ok: false,
      reason: 'NAME_LENGTH',
    });
  });

  it('flags a bad key-prefix format', () => {
    expect(validateProject({ name: 'Marketing', keyPrefix: 'mkt' })).toEqual({
      ok: false,
      reason: 'KEY_PREFIX_FORMAT',
    });
  });

  it('checks name before key prefix', () => {
    expect(validateProject({ name: '', keyPrefix: 'bad' })).toEqual({
      ok: false,
      reason: 'NAME_LENGTH',
    });
  });
});
