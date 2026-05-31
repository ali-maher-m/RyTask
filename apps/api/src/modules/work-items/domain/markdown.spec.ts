import { describe, expect, it } from 'vitest';
import { extractMentions } from './markdown';

/**
 * Unit test for the @mention extractor (T036, FR-WI-006). Pure, zero-dependency: pull
 * `@handle` spans out of markdown so the update/comment providers can seed MENTIONED
 * watchers and the notify seam. Must not be fooled by emails or code spans.
 */
describe('extractMentions', () => {
  it('extracts plain @handles', () => {
    expect(extractMentions('cc @founder and @marissa please')).toEqual(['founder', 'marissa']);
  });

  it('deduplicates and preserves first-seen order', () => {
    expect(extractMentions('@a @b @a')).toEqual(['a', 'b']);
  });

  it('ignores email addresses (no leading boundary)', () => {
    expect(extractMentions('mail me at founder@rytask.local')).toEqual([]);
  });

  it('handles dotted / hyphenated / numeric handles', () => {
    expect(extractMentions('ping @jane.doe and @al-bert and @user2')).toEqual([
      'jane.doe',
      'al-bert',
      'user2',
    ]);
  });

  it('returns [] for text with no mentions or empty input', () => {
    expect(extractMentions('no mentions here')).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });

  it('is case-preserving on the handle but matches at line start', () => {
    expect(extractMentions('@Founder leads')).toEqual(['Founder']);
  });
});
