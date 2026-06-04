import { previewTokens } from '@/lib/quick-add/tokenizer';
import { describe, expect, it } from 'vitest';

/**
 * Quick-add preview tokenizer (US2, T039, quick-add-grammar.md). The tokenizer is DISPLAY ONLY —
 * the server is the parser of record (D13) — so these cases pin its preview behavior: a bare
 * title yields one default item (no chips), a full token line yields four chips + the title,
 * an escaped \@name stays literal in the title, and an ambiguous token still previews (to be
 * reconciled to the server's meta.unresolved in the component).
 */
describe('previewTokens', () => {
  it('treats a bare title as a single item with no chips', () => {
    const { chips, titlePreview } = previewTokens('Buy more milk');
    expect(chips).toHaveLength(0);
    expect(titlePreview).toBe('Buy more milk');
  });

  it('parses a full token line into four chips plus the title', () => {
    const { chips, titlePreview } = previewTokens('Fix login redirect @ali #bug !urgent ^Friday');
    expect(titlePreview).toBe('Fix login redirect');
    expect(chips.map((c) => c.kind)).toEqual(['assignee', 'label', 'priority', 'date']);
    expect(chips.map((c) => c.raw)).toEqual(['@ali', '#bug', '!urgent', '^Friday']);
    expect(chips.map((c) => c.value)).toEqual(['ali', 'bug', 'urgent', 'Friday']);
  });

  it('locally resolves known priority + date vocab but never an assignee/label', () => {
    const { chips } = previewTokens('@ali #bug !urgent ^2026-07-04');
    const byKind = Object.fromEntries(chips.map((c) => [c.kind, c.resolved]));
    expect(byKind.priority).toBe(true);
    expect(byKind.date).toBe(true);
    expect(byKind.assignee).toBe(false);
    expect(byKind.label).toBe(false);
  });

  it('keeps an escaped \\@name literal in the title (no chip)', () => {
    const { chips, titlePreview } = previewTokens('Email \\@ali about the launch');
    expect(chips).toHaveLength(0);
    expect(titlePreview).toBe('Email @ali about the launch');
  });

  it('keeps a quoted phrase literal in the title', () => {
    const { chips, titlePreview } = previewTokens('Ship "the #1 fix" today');
    expect(chips).toHaveLength(0);
    expect(titlePreview).toBe('Ship the #1 fix today');
  });

  it('still previews an ambiguous token (unknown date stays unresolved for the server)', () => {
    const { chips, titlePreview } = previewTokens('Ship it ^someday');
    expect(titlePreview).toBe('Ship it');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ kind: 'date', raw: '^someday', resolved: false });
  });

  it('leaves an email address (mid-word @) in the title, not a token', () => {
    const { chips, titlePreview } = previewTokens('Ping ali@example.com about it');
    expect(chips).toHaveLength(0);
    expect(titlePreview).toBe('Ping ali@example.com about it');
  });
});
