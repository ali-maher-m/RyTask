/**
 * Full workspace data export (M5, FR-PORT-003/004, BRD AC-12 — "no lock-in; safe exit/backup").
 * One COMPLETE, tenant-scoped JSON archive: soft-deleted items/comments/time-logs are included
 * with their `deletedAt` (an archive that hides the trash is not a safe exit). All timestamps are
 * ISO-8601 UTC strings; dates are `YYYY-MM-DD`. CSV is offered for the two tabular cores
 * (`work-items`, `time-logs`) — the spreadsheet-friendly views of the same data.
 */

export interface ExportedOrganization {
  id: string;
  name: string;
  slug: string;
  settings: unknown;
  createdAt: string;
}

export interface ExportedWorkspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface ExportedMember {
  userId: string;
  email: string;
  name: string;
  role: string;
  deactivatedAt: string | null;
  createdAt: string;
}

export interface ExportedProject {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  description: string | null;
  color: string;
  leadId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface ExportedStatus {
  id: string;
  projectId: string;
  name: string;
  category: string;
  color: string;
  position: number;
}

export interface ExportedLabel {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
}

export interface ExportedWorkItem {
  id: string;
  projectId: string;
  /** Human key, e.g. `RY-12` (project prefix + number). */
  key: string;
  number: number;
  title: string;
  description: string | null;
  statusId: string;
  priority: string;
  source: string;
  assigneeId: string | null;
  reporterId: string | null;
  parentId: string | null;
  labelIds: string[];
  estimateValue: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ExportedComment {
  id: string;
  workItemId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ExportedTimeLog {
  id: string;
  projectId: string;
  workItemId: string;
  userId: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  note: string | null;
  billable: boolean;
  source: string;
  classification: string;
  classificationOverridden: boolean;
  createdAt: string;
  deletedAt: string | null;
}

/** GET /export/workspace — the complete archive. */
export interface WorkspaceExportDto {
  format: 'rytask.workspace-export';
  version: 1;
  exportedAt: string;
  organization: ExportedOrganization;
  workspaces: ExportedWorkspace[];
  members: ExportedMember[];
  projects: ExportedProject[];
  statuses: ExportedStatus[];
  labels: ExportedLabel[];
  workItems: ExportedWorkItem[];
  comments: ExportedComment[];
  timeLogs: ExportedTimeLog[];
  /** Row counts per section — a quick completeness check for the reader (and the tests). */
  counts: {
    workspaces: number;
    members: number;
    projects: number;
    statuses: number;
    labels: number;
    workItems: number;
    comments: number;
    timeLogs: number;
  };
}

/** `?format=csv&entity=…` — the two tabular cores available as CSV. */
export const EXPORT_CSV_ENTITIES = ['work-items', 'time-logs'] as const;
export type ExportCsvEntity = (typeof EXPORT_CSV_ENTITIES)[number];
