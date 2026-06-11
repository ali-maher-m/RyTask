import type { InterruptionLedger, ReportOverview } from '@rytask/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Component test for the flagship report client (US1, web-surfaces §6). With the API mocked, the
 * controls + narrative + headline figures + per-week and top-items tables render the overview DTO
 * faithfully, and a zero-logged range shows the plain empty state (no zeros-pretending-to-be-insight).
 */
const { fetchReportOverview, fetchInterruptionLedger, listProjects, listMemberships } = vi.hoisted(
  () => ({
    fetchReportOverview: vi.fn(),
    fetchInterruptionLedger: vi.fn(),
    listProjects: vi.fn(async () => []),
    listMemberships: vi.fn(async () => []),
  }),
);

vi.mock('@/lib/api/time', () => ({ fetchReportOverview, fetchInterruptionLedger }));
vi.mock('@/lib/api', () => ({
  listProjects,
  listMemberships,
  mapApiError: (e: unknown) => ({ kind: 'error', message: String(e) }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/reports',
  useSearchParams: () => new URLSearchParams(),
}));

import { ReportsClient } from './reports-client';

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
  topItems: [
    {
      workItemId: 'wi-1',
      projectId: 'p-1',
      key: 'RY-1',
      title: 'Ship the report',
      loggedSeconds: 10800,
    },
  ],
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
      title: 'Triage the outage',
      captureSource: 'SLACK',
      reporter: { id: 'u-1', name: 'Dana' },
      entryCount: 1,
      seconds: 1800,
    },
  ],
  weeks: [{ weekStart: '2026-06-01', seconds: 1800, itemCount: 1 }],
};

const emptyLedger: InterruptionLedger = {
  range: { from: '2026-06-01', to: '2026-06-14' },
  totalSeconds: 0,
  itemCount: 0,
  entryCount: 0,
  items: [],
  weeks: [],
};

describe('ReportsClient', () => {
  beforeEach(() => {
    fetchReportOverview.mockReset();
    fetchInterruptionLedger.mockReset();
    fetchReportOverview.mockResolvedValue(overview);
    fetchInterruptionLedger.mockResolvedValue(ledger);
  });

  it('renders the controls', async () => {
    render(<ReportsClient />);
    expect(await screen.findByTestId('range-preset')).toBeTruthy();
    expect(screen.getByTestId('project-select')).toBeTruthy();
    expect(screen.getByTestId('person-select')).toBeTruthy();
  });

  it('renders the narrative, headline figures, and both tables from the DTO', async () => {
    render(<ReportsClient />);

    const total = await screen.findByTestId('report-total');
    expect(total.textContent).toBe('3h 40m');
    expect(screen.getByTestId('report-planned').textContent).toBe('3h 10m');
    expect(screen.getByTestId('report-interruption').textContent).toBe('30m');

    expect(screen.getByTestId('report-narrative').textContent).toContain('you tracked 3h 40m');

    // By-week table: two week rows including the figures.
    const weeks = screen.getByTestId('report-weeks');
    expect(weeks.textContent).toContain('2026-06-01');
    expect(weeks.textContent).toContain('2026-06-08');

    // Top time sinks: the item key + title.
    const top = screen.getByTestId('report-top-items');
    expect(top.textContent).toContain('RY-1');
    expect(top.textContent).toContain('Ship the report');
  });

  it('renders the interruption ledger with a footer total equal to the headline figure', async () => {
    render(<ReportsClient />);
    const ledgerEl = await screen.findByTestId('report-ledger');
    expect(ledgerEl.textContent).toContain('RY-2');
    expect(ledgerEl.textContent).toContain('Dana'); // "raised by"
    // The footer total equals the headline interruption figure (both 30m → SC-003).
    expect(screen.getByTestId('ledger-total').textContent).toBe('30m');
    expect(screen.getByTestId('report-interruption').textContent).toBe('30m');
  });

  it('has no axe violations once the report has rendered', async () => {
    const { container } = render(<ReportsClient />);
    await screen.findByTestId('report-ledger');
    // Color contrast needs computed styles jsdom does not provide; structure/labels/roles are checked.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('shows "(removed user)" when a ledger row has no reporter', async () => {
    fetchInterruptionLedger.mockResolvedValue({
      ...ledger,
      items: [{ ...ledger.items[0], reporter: null }],
    });
    render(<ReportsClient />);
    const ledgerEl = await screen.findByTestId('report-ledger');
    expect(ledgerEl.textContent).toContain('(removed user)');
  });

  it('shows the plain empty state for a zero-logged range', async () => {
    fetchReportOverview.mockResolvedValue({
      ...overview,
      totals: { loggedSeconds: 0, plannedSeconds: 0, interruptionSeconds: 0 },
      weeks: [],
      topItems: [],
    });
    fetchInterruptionLedger.mockResolvedValue(emptyLedger);
    render(<ReportsClient />);
    await waitFor(() => expect(screen.getByTestId('reports-empty')).toBeTruthy());
    expect(screen.getByTestId('reports-empty').textContent).toContain(
      'No time tracked in this range',
    );
  });
});
