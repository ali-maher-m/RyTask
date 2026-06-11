import type { ExportedTimeLog, ExportedWorkItem } from '@rytask/contracts';
import { describe, expect, it } from 'vitest';
import { buildCsv, csvField, timeLogsCsv, workItemsCsv } from './export-csv';

/**
 * Unit tests for the export CSV serializer (M5, FR-PORT-003). RFC-4180 escaping, null → empty,
 * and the two entity tables render one row per record with stable headers.
 */
describe('export-csv', () => {
  it('escapes commas, quotes, and newlines; nulls render empty', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
  });

  it('builds header + rows with a trailing newline', () => {
    expect(buildCsv(['a', 'b'], [['1', 'x,y']])).toBe('a,b\n1,"x,y"\n');
  });

  it('renders one row per work item with the key first and labels space-joined', () => {
    const item: ExportedWorkItem = {
      id: 'i1',
      projectId: 'p1',
      key: 'RY-7',
      number: 7,
      title: 'Fix the "big" bug, urgently',
      description: null,
      statusId: 's1',
      priority: 'URGENT',
      source: 'WEB',
      assigneeId: null,
      reporterId: 'u1',
      parentId: null,
      labelIds: ['l1', 'l2'],
      estimateValue: '2',
      startDate: null,
      endDate: null,
      dueDate: '2026-06-12',
      completedAt: null,
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T00:00:00.000Z',
      deletedAt: null,
    };
    const csv = workItemsCsv([item]);
    const [header, row, trailing] = csv.split('\n');
    expect(header?.startsWith('key,title,')).toBe(true);
    expect(row).toContain('RY-7');
    expect(row).toContain('"Fix the ""big"" bug, urgently"');
    expect(row).toContain('l1 l2');
    expect(trailing).toBe('');
  });

  it('renders one row per time log with duration and classification', () => {
    const log: ExportedTimeLog = {
      id: 't1',
      projectId: 'p1',
      workItemId: 'i1',
      userId: 'u1',
      startedAt: '2026-06-11T09:00:00.000Z',
      endedAt: '2026-06-11T10:00:00.000Z',
      durationSeconds: 3600,
      note: null,
      billable: false,
      source: 'TIMER',
      classification: 'INTERRUPTION',
      classificationOverridden: true,
      createdAt: '2026-06-11T10:00:00.000Z',
      deletedAt: null,
    };
    const csv = timeLogsCsv([log]);
    expect(csv.split('\n')).toHaveLength(3); // header + row + trailing ''
    expect(csv).toContain('3600');
    expect(csv).toContain('INTERRUPTION');
  });
});
