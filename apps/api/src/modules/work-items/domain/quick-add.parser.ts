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

/** Format chrono's parsed components as a tz-stable YYYY-MM-DD (no UTC drift). */
function parseDate(value: string, referenceDate: Date): string | undefined {
  const results = chrono.parse(value, referenceDate, { forwardDate: true });
  const start = results[0]?.start;
  if (!start) return undefined;
  const y = start.get('year');
  const m = start.get('month');
  const d = start.get('day');
  if (y == null || m == null || d == null) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseQuickAdd(input: string, opts: QuickAddOptions): QuickAddResult {
  const assignees: string[] = [];
  const labels: string[] = [];
  const unresolved: UnresolvedToken[] = [];
  const titleParts: string[] = [];
  let priority: ParsedPriority | undefined;
  let dueDate: string | undefined;

  for (const word of input.split(/\s+/).filter(Boolean)) {
    // Escaped literal marker: drop the backslash, keep the rest as title text.
    if (/^\\[@#!^]/.test(word)) {
      titleParts.push(word.slice(1));
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
        const resolved = parseDate(value, opts.referenceDate);
        if (resolved) {
          dueDate = resolved;
        } else {
          unresolved.push({ token: word, kind: 'date' });
        }
      }
      continue;
    }

    titleParts.push(word);
  }

  return { title: titleParts.join(' ').trim(), assignees, labels, priority, dueDate, unresolved };
}
