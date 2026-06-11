import type { WorkspaceExportDto } from '@rytask/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * Export card flow test (M5, AC-12). The JSON archive and both CSV entities download via the
 * authed fetch seam (a plain link can't carry the bearer token); success shows a plain-language
 * count summary; a failure shows the alert. Blob/anchor plumbing is stubbed (jsdom).
 */
const ARCHIVE = {
  format: 'rytask.workspace-export',
  version: 1,
  exportedAt: '2026-06-11T12:00:00.000Z',
  organization: { id: 'o1', name: 'Acme', slug: 'acme', settings: {}, createdAt: '' },
  workspaces: [],
  members: [],
  projects: [],
  statuses: [],
  labels: [],
  workItems: [],
  comments: [],
  timeLogs: [],
  counts: {
    workspaces: 1,
    members: 2,
    projects: 3,
    statuses: 5,
    labels: 0,
    workItems: 7,
    comments: 4,
    timeLogs: 11,
  },
} as unknown as WorkspaceExportDto;

const { api } = vi.hoisted(() => ({
  api: {
    fetchWorkspaceExport: vi.fn(),
    fetchWorkspaceExportCsv: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  ...api,
}));

import { ExportCard } from '@/app/(app)/settings/organization/export-card';
import { ApiError } from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no blob-URL or download plumbing — stub the seams the card uses.
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('ExportCard', () => {
  it('downloads the JSON archive and reports what it contained', async () => {
    api.fetchWorkspaceExport.mockResolvedValue(ARCHIVE);
    render(<ExportCard />);

    fireEvent.click(screen.getByTestId('export-json'));

    await waitFor(() => expect(api.fetchWorkspaceExport).toHaveBeenCalledTimes(1));
    const note = await screen.findByText(/7 work items/);
    expect(note.textContent).toContain('11 time entries');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('downloads each CSV entity through the authed seam', async () => {
    api.fetchWorkspaceExportCsv.mockResolvedValue('key,title\nRY-1,x\n');
    render(<ExportCard />);

    fireEvent.click(screen.getByTestId('export-csv-work-items'));
    await waitFor(() => expect(api.fetchWorkspaceExportCsv).toHaveBeenCalledWith('work-items'));

    fireEvent.click(screen.getByTestId('export-csv-time-logs'));
    await waitFor(() => expect(api.fetchWorkspaceExportCsv).toHaveBeenCalledWith('time-logs'));
  });

  it('shows a plain alert when the export fails', async () => {
    api.fetchWorkspaceExport.mockRejectedValue(new ApiError(403, 'forbidden'));
    render(<ExportCard />);

    fireEvent.click(screen.getByTestId('export-json'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ExportCard />);
    // Color contrast needs computed styles jsdom does not provide; structure/labels/roles are checked.
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
