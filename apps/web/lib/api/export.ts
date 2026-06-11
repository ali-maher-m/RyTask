'use client';

import type { ExportCsvEntity, WorkspaceExportDto } from '@rytask/contracts';
import { ApiError, authedFetch, authedRequest } from './http';

/**
 * Workspace export resource module (M5, AC-12, FR-PORT-003/004). `/export/workspace` —
 * OWNER/ADMIN-only full-tenant archive, fetched with the bearer token (a plain anchor can't
 * carry it) and saved client-side by the Settings card.
 */

/** GET /export/workspace — the complete JSON archive. */
export function fetchWorkspaceExport(): Promise<WorkspaceExportDto> {
  return authedRequest<WorkspaceExportDto>('/export/workspace');
}

/** GET /export/workspace?format=csv&entity=… — one tabular core as CSV text. */
export async function fetchWorkspaceExportCsv(entity: ExportCsvEntity): Promise<string> {
  const res = await authedFetch(`/export/workspace?format=csv&entity=${entity}`);
  if (!res.ok) {
    throw new ApiError(res.status, 'Could not export the workspace.');
  }
  return res.text();
}
