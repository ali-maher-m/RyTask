import type { InterruptionLedger, ReportOverview } from '@rytask/contracts';
import { formatHm } from './report-text';

/**
 * Client-side CSV export of the report (US4, research D7, web-surfaces §4). `toCsv` serializes the
 * **already-rendered** overview + ledger state — three sections (summary, interruption ledger, by
 * week) — so the file equals the screen exactly (SC-004): no server round-trip that could drift. Pure
 * and unit-tested; RFC-4180 quoting, CRLF line endings, UTF-8 when downloaded.
 */

/** RFC-4180: quote a field iff it contains a comma, quote, CR, or LF; double any embedded quotes. */
function field(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV record from raw field values. */
function row(...values: Array<string | number>): string {
  return values.map(field).join(',');
}

/** Serialize the overview + ledger to an RFC-4180 CSV string (three sections, CRLF-delimited). */
export function toCsv(overview: ReportOverview, ledger: InterruptionLedger): string {
  const { range, totals, weeks } = overview;
  const lines: string[] = [];

  // ── Section 1: summary ──
  lines.push('Summary');
  lines.push(row('Range', `${range.from} to ${range.to}`));
  lines.push(row('Metric', 'Seconds', 'Time'));
  lines.push(row('Logged', totals.loggedSeconds, formatHm(totals.loggedSeconds)));
  lines.push(row('Planned', totals.plannedSeconds, formatHm(totals.plannedSeconds)));
  lines.push(
    row('Interruptions', totals.interruptionSeconds, formatHm(totals.interruptionSeconds)),
  );

  // ── Section 2: interruption ledger ──
  lines.push('');
  lines.push('Interruption ledger');
  lines.push(row('Key', 'Title', 'Source', 'Raised by', 'Entries', 'Seconds', 'Time'));
  for (const item of ledger.items) {
    lines.push(
      row(
        item.key,
        item.title,
        item.captureSource,
        item.reporter ? item.reporter.name : '(removed user)',
        item.entryCount,
        item.seconds,
        formatHm(item.seconds),
      ),
    );
  }

  // ── Section 3: by week ──
  lines.push('');
  lines.push('By week');
  lines.push(row('Week', 'Logged seconds', 'Planned seconds', 'Interruption seconds'));
  for (const w of weeks) {
    lines.push(row(w.weekStart, w.loggedSeconds, w.plannedSeconds, w.interruptionSeconds));
  }

  return lines.join('\r\n');
}

/** The download filename for a report, carrying its active range. */
export function reportCsvFilename(overview: ReportOverview): string {
  return `rytask-report-${overview.range.from}-${overview.range.to}.csv`;
}

/**
 * Download the current report as a CSV via a `Blob` + transient anchor (UTF-8). Browser-only — the
 * caller is a client component handler; the content equals {@link toCsv} of the rendered state.
 */
export function downloadReportCsv(overview: ReportOverview, ledger: InterruptionLedger): void {
  const csv = toCsv(overview, ledger);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = reportCsvFilename(overview);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
