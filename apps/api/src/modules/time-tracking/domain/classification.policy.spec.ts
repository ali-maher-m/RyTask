import type { Priority } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';
import { deriveClassification, resolveClassification } from './classification.policy';

/**
 * Unit test for the planned-vs-interruption classification policy (T060, time-tracking-flow.md §4):
 * Urgent⇒interruption, every other priority⇒planned, and override precedence (an explicit class always
 * wins and marks the entry overridden, regardless of priority).
 */
describe('deriveClassification (priority baseline)', () => {
  it('classifies URGENT work as an interruption', () => {
    expect(deriveClassification({ priority: 'URGENT' })).toBe('INTERRUPTION');
  });

  it('classifies every non-urgent priority as planned', () => {
    const planned: Priority[] = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
    for (const priority of planned) {
      expect(deriveClassification({ priority })).toBe('PLANNED');
    }
  });
});

describe('resolveClassification (override precedence)', () => {
  it('derives the default and is not overridden when no explicit class is given', () => {
    expect(resolveClassification(undefined, { priority: 'URGENT' })).toEqual({
      classification: 'INTERRUPTION',
      classificationOverridden: false,
    });
    expect(resolveClassification(null, { priority: 'MEDIUM' })).toEqual({
      classification: 'PLANNED',
      classificationOverridden: false,
    });
  });

  it('honors an explicit class and marks it overridden, even against the priority default', () => {
    // Explicit PLANNED on an URGENT item overrides the interruption default.
    expect(resolveClassification('PLANNED', { priority: 'URGENT' })).toEqual({
      classification: 'PLANNED',
      classificationOverridden: true,
    });
    // Explicit INTERRUPTION on a normal item overrides the planned default.
    expect(resolveClassification('INTERRUPTION', { priority: 'LOW' })).toEqual({
      classification: 'INTERRUPTION',
      classificationOverridden: true,
    });
  });
});
