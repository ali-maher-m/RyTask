import { describe, expect, it } from 'vitest';
import { MAX_KEYS_PER_TEXT, extractItemKeys } from './magic-words.parser';

/**
 * Unit tests for the magic-word parser (M5, FR-INT-GH-006). Bare keys and magic-worded keys both
 * link; keys normalize to uppercase; duplicates collapse to the first occurrence; the per-text
 * fan-out is capped.
 */
describe('magic-words.parser', () => {
  it('extracts a magic-worded key (the AC-11 form)', () => {
    expect(extractItemKeys('Fixes RY-12: stop the login loop')).toEqual([
      { key: 'RY-12', magicWord: 'fixes' },
    ]);
  });

  it('extracts a bare key reference (FR-INT-GH-006 acceptance: "ENG-142 fix")', () => {
    expect(extractItemKeys('ENG-142 fix the dropdown')).toEqual([
      { key: 'ENG-142', magicWord: null },
    ]);
  });

  it('normalizes lowercase keys and magic words ("closes: ry-3")', () => {
    expect(extractItemKeys('closes: ry-3')).toEqual([{ key: 'RY-3', magicWord: 'closes' }]);
  });

  it('recognizes the documented magic-word family', () => {
    for (const word of ['fix', 'fixes', 'fixed', 'close', 'closed', 'resolves', 'refs']) {
      const [ref] = extractItemKeys(`${word} RY-7`);
      expect(ref).toEqual({ key: 'RY-7', magicWord: word });
    }
  });

  it('extracts several distinct keys and dedupes repeats (first occurrence wins)', () => {
    const refs = extractItemKeys('Fixes RY-1, also touches RY-2 and again ry-1');
    expect(refs).toEqual([
      { key: 'RY-1', magicWord: 'fixes' },
      { key: 'RY-2', magicWord: null },
    ]);
  });

  it('returns nothing for text without key-shaped tokens', () => {
    expect(extractItemKeys('chore: bump deps; no ticket')).toEqual([]);
  });

  it('caps the number of distinct keys per text', () => {
    const text = Array.from({ length: 40 }, (_, i) => `RY-${i + 1}`).join(' ');
    expect(extractItemKeys(text)).toHaveLength(MAX_KEYS_PER_TEXT);
  });
});
