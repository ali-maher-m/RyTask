import type { ExportedTimeLog, ExportedWorkItem } from '@rytask/contracts';

/**
 * CSV serialization for the two tabular export cores (M5, FR-PORT-003 — open, documented
 * formats). Pure functions, RFC-4180 shaped: fields containing a comma, quote, or newline are
 * quoted with internal quotes doubled; rows join with `\n`; null/undefined render empty. No
 * dependency — the M4 web `csv.ts` precedent, server-side.
 */

type CsvValue = string | number | boolean | null | undefined;

/** Escape one field per RFC 4180 (quote when it contains a comma, quote, or newline). */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Serialize a header + rows into one CSV document (trailing newline included). */
export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','));
  return `${lines.join('\n')}\n`;
}

/** Work items as a flat spreadsheet (labels joined as a space-separated id list). */
export function workItemsCsv(items: ExportedWorkItem[]): string {
  return buildCsv(
    [
      'key',
      'title',
      'status_id',
      'priority',
      'source',
      'assignee_id',
      'reporter_id',
      'parent_id',
      'estimate_value',
      'start_date',
      'end_date',
      'due_date',
      'completed_at',
      'created_at',
      'updated_at',
      'deleted_at',
      'label_ids',
      'description',
    ],
    items.map((i) => [
      i.key,
      i.title,
      i.statusId,
      i.priority,
      i.source,
      i.assigneeId,
      i.reporterId,
      i.parentId,
      i.estimateValue,
      i.startDate,
      i.endDate,
      i.dueDate,
      i.completedAt,
      i.createdAt,
      i.updatedAt,
      i.deletedAt,
      i.labelIds.join(' '),
      i.description,
    ]),
  );
}

/** Time logs as a flat spreadsheet — the evidence table behind the M4 reports. */
export function timeLogsCsv(logs: ExportedTimeLog[]): string {
  return buildCsv(
    [
      'id',
      'project_id',
      'work_item_id',
      'user_id',
      'started_at',
      'ended_at',
      'duration_seconds',
      'classification',
      'classification_overridden',
      'source',
      'billable',
      'note',
      'created_at',
      'deleted_at',
    ],
    logs.map((l) => [
      l.id,
      l.projectId,
      l.workItemId,
      l.userId,
      l.startedAt,
      l.endedAt,
      l.durationSeconds,
      l.classification,
      l.classificationOverridden,
      l.source,
      l.billable,
      l.note,
      l.createdAt,
      l.deletedAt,
    ]),
  );
}
