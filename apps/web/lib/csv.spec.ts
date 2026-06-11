import type { InterruptionLedger, ReportOverview } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';
import { reportCsvFilename, toCsv } from './csv';

/**
 * Unit tests for the client-side CSV export (US4, web-surfaces §4, SC-004). `toCsv` serializes the
 * already-rendered overview + ledger state — three sections (summary, interruption ledger, by week) —
 * with RFC-4180 quoting, so the file equals the screen exactly. An empty range yields a valid
 * headers-only CSV (no data rows beyond the zeroed summary).
 */
const overview: ReportOverview = {
  range: { from: '2026-06-01', to: '2026-06-14' },
  totals: { loggedSeconds: 13200, plannedSeconds: 11400, interruptionSeconds: 1800 },
  weeks: [
    {
      weekStart: '2026-06-01',
      loggedSeconds: 5400,
      plannedSeconds: 3600,
      interruptionSeconds: 1800,
    },
    { weekStart: '2026-06-08', loggedSeconds: 7800, plannedSeconds: 7800, interruptionSeconds: 0 },
  ],
  topItems: [],
};

const ledger: InterruptionLedger = {
  range: { from: '2026-06-01', to: '2026-06-14' },
  totalSeconds: 1800,
  itemCount: 1,
  entryCount: 1,
  items: [
    {
      workItemId: 'wi-2',
      projectId: 'p-1',
      key: 'RY-2',
      title: 'Outage, with a comma',
      captureSource: 'SLACK',
      reporter: { id: 'u-1', name: 'Dana' },
      entryCount: 1,
      seconds: 1800,
    },
  ],
  weeks: [{ weekStart: '2026-06-01', seconds: 1800, itemCount: 1 }],
};

describe('toCsv', () => {
  it('emits the three sections with their headers', () => {
    const csv = toCsv(overview, ledger);
    expect(csv).toContain('Summary');
    expect(csv).toContain('Metric,Seconds,Time');
    expect(csv).toContain('Interruption ledger');
    expect(csv).toContain('Key,Title,Source,Raised by,Entries,Seconds,Time');
    expect(csv).toContain('By week');
    expect(csv).toContain('Week,Logged seconds,Planned seconds,Interruption seconds');
  });

  it('reflects the input totals, ledger rows, and weeks exactly', () => {
    const lines = toCsv(overview, ledger).split('\r\n');
    expect(lines).toContain('Logged,13200,3h 40m');
    expect(lines).toContain('Planned,11400,3h 10m');
    expect(lines).toContain('Interruptions,1800,30m');
    expect(lines).toContain('2026-06-01,5400,3600,1800');
    expect(lines).toContain('2026-06-08,7800,7800,0');
  });

  it('quotes fields containing commas (RFC-4180)', () => {
    const csv = toCsv(overview, ledger);
    expect(csv).toContain('RY-2,"Outage, with a comma",SLACK,Dana,1,1800,30m');
  });

  it('uses CRLF line endings', () => {
    expect(toCsv(overview, ledger)).toContain('\r\n');
  });

  it('renders "(removed user)" for a null reporter', () => {
    const csv = toCsv(overview, {
      ...ledger,
      items: [
        {
          workItemId: 'wi-2',
          projectId: 'p-1',
          key: 'RY-2',
          title: 'Pager',
          captureSource: 'SLACK',
          reporter: null,
          entryCount: 1,
          seconds: 1800,
        },
      ],
    });
    expect(csv).toContain('RY-2,Pager,SLACK,(removed user),1,1800,30m');
  });

  it('produces a valid headers-only CSV for an empty range', () => {
    const empty: ReportOverview = {
      range: { from: '2026-06-01', to: '2026-06-07' },
      totals: { loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
      weeks: [
        { weekStart: '2026-06-01', loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
      ],
      topItems: [],
    };
    const emptyLedger: InterruptionLedger = {
      range: { from: '2026-06-01', to: '2026-06-07' },
      totalSeconds: 0,
      itemCount: 0,
      entryCount: 0,
      items: [],
      weeks: [],
    };
    const csv = toCsv(empty, emptyLedger);
    // The ledger section header is present but carries no item rows.
    expect(csv).toContain('Key,Title,Source,Raised by,Entries,Seconds,Time');
    expect(csv).toContain('Logged,0,0m');
    expect(csv).not.toContain('RY-2');
  });
});

describe('reportCsvFilename', () => {
  it('names the file after the active range', () => {
    expect(reportCsvFilename(overview)).toBe('rytask-report-2026-06-01-2026-06-14.csv');
  });
});
