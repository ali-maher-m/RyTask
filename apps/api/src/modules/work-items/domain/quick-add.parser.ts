import * as chrono from 'chrono-node';

/**
 * Pure quick-add grammar parser (FR-WI-004, research D2). Turns a single line into
 * structured tokens; handle/label resolution happens later in the provider (ports &
 * adapters). The reference date is injected so date parsing is deterministic and the
 * same parser powers the future Slack/MCP capture paths.
 *
 * Grammar (a marker only counts at the start of a whitespace-delimited word, so `C#`
 * and `foo@bar.com` are left alone; `\@ \# \! \^` escape a literal marker):
 *   @handle   → assignee candidate
 *   #label    → label name
 *   !priority → URGENT|HIGH|MEDIUM|LOW|NONE (case-insensitive)
 *   ^date     → due date (ISO or natural language: today/tomorrow/weekday)
 */

export type ParsedPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface UnresolvedToken {
  token: string;
  kind: 'assignee' | 'label' | 'priority' | 'date';
}

export interface QuickAddResult {
  title: string;
  assignees: string[];
  labels: string[];
  priority?: ParsedPriority;
  dueDate?: string;
  unresolved: UnresolvedToken[];
}

export interface QuickAddOptions {
  /** "Now" in the org timezone (Clock port). Drives relative date parsing. */
  referenceDate: Date;
}

const PRIORITIES: Record<string, ParsedPriority> = {
  urgent: 'URGENT',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  none: 'NONE',
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** Markers that start a token; a date phrase never consumes one (so `^fri #bug` stops at `#bug`). */
const MARKERS = new Set(['@', '#', '!', '^']);

/** Max words a single `^date` phrase may span (`^in 3 days` is 3). Bounds the look-ahead. */
const MAX_DATE_PHRASE_WORDS = 4;

/** Format chrono's parsed components as a tz-stable YYYY-MM-DD (no UTC drift). */
function formatStart(start: {
  get(component: 'year' | 'month' | 'day'): number | null;
}): string | undefined {
  const y = start.get('year');
  const m = start.get('month');
  const d = start.get('day');
  if (y == null || m == null || d == null) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Greedily parse a (possibly multi-word) date phrase beginning at `^word` (words[start]). Tries
 * the longest run of following non-marker words that chrono parses AS A WHOLE — so `^next Friday`
 * and `^in 3 days` resolve — shrinking to the single token otherwise. Returns the ISO date and how
 * many words it consumed (≥1), or null when nothing parses. The whole-phrase match guard stops it
 * from swallowing trailing title words (e.g. `^friday ship it` consumes only `^friday`).
 */
function parseDatePhrase(
  words: string[],
  start: number,
  referenceDate: Date,
): { date: string; consumed: number } | null {
  const head = words[start];
  if (!head) return null;
  let maxWords = 1;
  while (
    maxWords < MAX_DATE_PHRASE_WORDS &&
    start + maxWords < words.length &&
    !MARKERS.has(words[start + maxWords]?.[0] ?? '')
  ) {
    maxWords++;
  }
  for (let len = maxWords; len >= 1; len--) {
    const phrase = [head.slice(1), ...words.slice(start + 1, start + len)].join(' ').trim();
    if (!phrase) continue;
    const result = chrono.parse(phrase, referenceDate, { forwardDate: true })[0];
    // Accept only when chrono matched the WHOLE phrase (else it found a date inside title text).
    if (result && result.index === 0 && result.text.trim().length === phrase.length) {
      const date = formatStart(result.start);
      if (date) return { date, consumed: len };
    }
  }
  return null;
}

export function parseQuickAdd(input: string, opts: QuickAddOptions): QuickAddResult {
  const assignees: string[] = [];
  const labels: string[] = [];
  const unresolved: UnresolvedToken[] = [];
  const titleParts: string[] = [];
  let priority: ParsedPriority | undefined;
  let dueDate: string | undefined;

  const words = input.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (!word) {
      i++;
      continue;
    }
    // Escaped literal marker: drop the backslash, keep the rest as title text.
    if (/^\\[@#!^]/.test(word)) {
      titleParts.push(word.slice(1));
      i++;
      continue;
    }

    const marker = word[0];
    const value = word.slice(1);

    if (
      (marker === '@' || marker === '#' || marker === '!' || marker === '^') &&
      value.length > 0
    ) {
      if (marker === '@') {
        assignees.push(value);
      } else if (marker === '#') {
        labels.push(value);
      } else if (marker === '!') {
        const resolved = PRIORITIES[value.toLowerCase()];
        if (resolved) {
          priority = resolved;
        } else {
          unresolved.push({ token: word, kind: 'priority' });
        }
      } else {
        // `^date` — supports multi-word natural phrases (`^next Friday`, `^in 3 days`).
        const parsed = parseDatePhrase(words, i, opts.referenceDate);
        if (parsed) {
          dueDate = parsed.date;
          i += parsed.consumed;
          continue;
        }
        unresolved.push({ token: word, kind: 'date' });
      }
      i++;
      continue;
    }

    titleParts.push(word);
    i++;
  }

  return { title: titleParts.join(' ').trim(), assignees, labels, priority, dueDate, unresolved };
}
