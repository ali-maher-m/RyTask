/**
 * Display-only quick-add preview tokenizer (D13, quick-add-grammar.md). Renders recognized
 * `@assignee #label !priority ^date` tokens as chips while the user types. It is NOT authoritative:
 * the SERVER parses the line of record and returns `meta.unresolved` (FR-WI-004). This preview
 * never owns correctness and never drops tokens — escaped/quoted `@#!^` stay literal in the title,
 * and assignee/label chips stay `resolved: false` until the server confirms them.
 */
export type TokenKind = 'assignee' | 'label' | 'priority' | 'date';

export interface ParsedToken {
  /** The full token as typed, e.g. "@ali". */
  raw: string;
  kind: TokenKind;
  /** The value after the sigil, e.g. "ali". */
  value: string;
  /** Whether the client could recognize it locally (priority/date vocab). Server is authoritative. */
  resolved: boolean;
}

export interface PreviewResult {
  chips: ParsedToken[];
  titlePreview: string;
}

const SIGILS: Record<string, TokenKind> = {
  '@': 'assignee',
  '#': 'label',
  '!': 'priority',
  '^': 'date',
};

const PRIORITY_VOCAB = new Set(['urgent', 'high', 'medium', 'low', 'none']);
const DATE_WORDS = new Set([
  'today',
  'tomorrow',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isKnownDate(value: string): boolean {
  return DATE_WORDS.has(value.toLowerCase()) || ISO_DATE.test(value);
}

/** Can the client recognize this token value without the server? (priority/date vocab only). */
function localResolves(kind: TokenKind, value: string): boolean {
  if (kind === 'priority') return PRIORITY_VOCAB.has(value.toLowerCase());
  if (kind === 'date') return isKnownDate(value);
  // Assignee handles and label slugs can only be resolved by the server.
  return false;
}

export function previewTokens(line: string): PreviewResult {
  const chips: ParsedToken[] = [];
  const titleParts: string[] = [];

  // Match either a double-quoted phrase (literal title) or a non-space run.
  const segments = line.match(/"[^"]*"|\S+/g) ?? [];

  for (const segment of segments) {
    // A quoted phrase is always literal title text (quotes stripped).
    if (segment.length >= 2 && segment.startsWith('"') && segment.endsWith('"')) {
      const inner = segment.slice(1, -1);
      if (inner) titleParts.push(inner);
      continue;
    }

    const first = segment[0] ?? '';

    // An escaped sigil (e.g. \@ali) stays literal in the title — the backslash is dropped.
    if (first === '\\' && segment.length > 1 && SIGILS[segment[1] ?? '']) {
      titleParts.push(segment.slice(1));
      continue;
    }

    const kind = SIGILS[first];
    if (kind && segment.length > 1) {
      const value = segment.slice(1);
      chips.push({ raw: segment, kind, value, resolved: localResolves(kind, value) });
      continue;
    }

    titleParts.push(segment);
  }

  return { chips, titlePreview: titleParts.join(' ') };
}
