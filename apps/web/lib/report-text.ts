import type { ReportOverview, WeeklySummary } from '@rytask/contracts';

/**
 * Deterministic report copy (US1/US3, research D8, web-surfaces §2/§4). Pure DTO → string functions —
 * no I/O, no `new Date()` of their own — so the narrative beside the figures and the paste-ready
 * "Copy as text" digest can never drift from what the screen shows, and pluralization / zero-states /
 * rounding are unit-tested. Sentence-case, jargon-free (the Albert/Marissa test); durations always
 * read as friendly `h`/`m`, never decimal hours.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Whole-seconds → `"Hh Mm"` (8100 → "2h 15m", 3600 → "1h", 1800 → "30m", 0 → "0m"). */
export function formatHm(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** `YYYY-MM-DD` → a friendly `"Jun 1"` (UTC, matching the report's day buckets). */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = MONTHS[(m ?? 1) - 1] ?? '';
  return `${month} ${d ?? ''}`.trim();
}

/**
 * The headline narrative sentence for `/reports` (US1). Built from the overview totals; the optional
 * `interruptionItemCount` (from the ledger, once loaded) adds "across N items". Percentages are
 * rounded and the planned share is the complement, so the two always sum to 100 in the text.
 */
export function narrative(overview: ReportOverview, interruptionItemCount?: number): string {
  const { from, to } = overview.range;
  const { loggedSeconds, plannedSeconds, interruptionSeconds } = overview.totals;

  if (loggedSeconds === 0) {
    return `No time was tracked between ${formatDay(from)} and ${formatDay(to)} yet.`;
  }

  const total = formatHm(loggedSeconds);
  if (interruptionSeconds === 0) {
    return `Between ${formatDay(from)} and ${formatDay(to)}, you tracked ${total} — all of it planned work.`;
  }

  const interruptionPct = Math.round((interruptionSeconds / loggedSeconds) * 100);
  const plannedPct = 100 - interruptionPct;
  const across =
    interruptionItemCount != null
      ? ` across ${interruptionItemCount} ${interruptionItemCount === 1 ? 'item' : 'items'}`
      : '';
  return `Between ${formatDay(from)} and ${formatDay(to)}, you tracked ${total}. Interruptions took ${formatHm(
    interruptionSeconds,
  )} (${interruptionPct}%)${across}, leaving ${formatHm(plannedSeconds)} (${plannedPct}%) for planned work.`;
}

/** A compact week label: `"May 18–24"` (same month) or `"Jun 29–Jul 5"` (crossing a month). */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [, startMonth] = weekStart.split('-').map(Number);
  const [, endMonth] = weekEnd.split('-').map(Number);
  const endDay = Number(weekEnd.split('-')[2]);
  return startMonth === endMonth
    ? `${formatDay(weekStart)}–${endDay}`
    : `${formatDay(weekStart)}–${formatDay(weekEnd)}`;
}

/**
 * The paste-ready "Copy as text" digest for My week (US3, web-surfaces §4) — deterministic so it
 * always matches the on-screen figures. Two header lines (total + split), then the completed list and
 * the top items when there are any. Durations via the shared `h`/`m` formatter; percentages sum to 100.
 */
export function digest(summary: WeeklySummary): string {
  const { weekStart, weekEnd, totals, items, completedItems } = summary;
  const { loggedSeconds, plannedSeconds, interruptionSeconds } = totals;

  const interruptionPct = loggedSeconds > 0 ? Math.round((interruptionSeconds / loggedSeconds) * 100) : 0;
  const plannedPct = loggedSeconds > 0 ? 100 - interruptionPct : 0;

  const lines = [
    `Week of ${formatWeekRange(weekStart, weekEnd)} — ${formatHm(loggedSeconds)} tracked`,
    `Planned ${formatHm(plannedSeconds)} (${plannedPct}%) · Interruptions ${formatHm(
      interruptionSeconds,
    )} (${interruptionPct}%)`,
  ];
  if (completedItems.length > 0) {
    lines.push(`Completed: ${completedItems.map((c) => `${c.key} ${c.title}`).join(', ')}`);
  }
  if (items.length > 0) {
    lines.push(
      `Top items: ${items
        .slice(0, 5)
        .map((i) => `${i.key} ${formatHm(i.loggedSeconds)}`)
        .join(' · ')}`,
    );
  }
  return lines.join('\n');
}
