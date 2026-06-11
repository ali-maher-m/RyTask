'use client';

import { ApiError, fetchWorkspaceExport, fetchWorkspaceExportCsv } from '@/lib/api';
import type { ExportCsvEntity } from '@rytask/contracts';
import { Button } from '@rytask/ui';
import { useId, useState } from 'react';

/**
 * Full workspace data export (M5, AC-12, FR-PORT-003/004 — "no lock-in; safe exit/backup",
 * BRD F17). Owner/Admin downloads the whole tenant's data: one complete JSON archive, plus the
 * two tabular cores as CSV for a spreadsheet. The API enforces OWNER/ADMIN; this card simply
 * lives on a page those roles reach. Fetched with the bearer token and saved client-side (a
 * plain link can't carry auth) — the M4 report-CSV mechanism.
 */
const CARD: React.CSSProperties = {
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
  padding: 'var(--space-4)',
  display: 'grid',
  gap: 'var(--space-3)',
  marginTop: 'var(--space-5)',
};

function saveFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function ExportCard() {
  const headingId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onExportJson() {
    setBusy('json');
    setError(null);
    setDone(null);
    try {
      const archive = await fetchWorkspaceExport();
      const stamp = archive.exportedAt.slice(0, 10);
      saveFile(
        `rytask-export-${stamp}.json`,
        JSON.stringify(archive, null, 2),
        'application/json;charset=utf-8',
      );
      setDone(
        `Exported ${archive.counts.workItems} work items, ${archive.counts.timeLogs} time entries, ` +
          `${archive.counts.comments} comments and ${archive.counts.projects} projects.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not export the workspace.');
    } finally {
      setBusy(null);
    }
  }

  async function onExportCsv(entity: ExportCsvEntity) {
    setBusy(entity);
    setError(null);
    setDone(null);
    try {
      const csv = await fetchWorkspaceExportCsv(entity);
      const stamp = new Date().toISOString().slice(0, 10);
      saveFile(`rytask-${entity}-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
      setDone('Exported.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not export the workspace.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={headingId} style={CARD} data-testid="export-card">
      <h2 id={headingId} style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>
        Export your data
      </h2>
      <p style={{ margin: 0, color: 'var(--fg-muted)', fontSize: 'var(--fs-sm)' }}>
        Download everything — projects, work items (including trashed ones), comments, time entries
        and members — as one JSON archive. Spreadsheet-friendly CSVs cover work items and time
        entries. Your data is never locked in.
      </p>

      {error ? (
        <p role="alert" style={{ color: 'var(--error)', margin: 0 }}>
          {error}
        </p>
      ) : null}
      {done ? (
        <output style={{ color: 'var(--success)', fontSize: 'var(--fs-sm)' }}>{done}</output>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Button
          type="button"
          variant="primary"
          loading={busy === 'json'}
          disabled={busy !== null && busy !== 'json'}
          onClick={onExportJson}
          data-testid="export-json"
        >
          Download JSON archive
        </Button>
        <Button
          type="button"
          variant="ghost"
          loading={busy === 'work-items'}
          disabled={busy !== null && busy !== 'work-items'}
          onClick={() => onExportCsv('work-items')}
          data-testid="export-csv-work-items"
        >
          Work items (CSV)
        </Button>
        <Button
          type="button"
          variant="ghost"
          loading={busy === 'time-logs'}
          disabled={busy !== null && busy !== 'time-logs'}
          onClick={() => onExportCsv('time-logs')}
          data-testid="export-csv-time-logs"
        >
          Time entries (CSV)
        </Button>
      </div>
    </section>
  );
}
