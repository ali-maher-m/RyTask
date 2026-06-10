import { describe, expect, it } from 'vitest';
import { type WorkItemRowLike, toWorkItemDto } from './work-item.mapper';

/**
 * Unit tests for the persisted-row → API `WorkItem` mapper. Covers the derived display key, the
 * numeric/nullable coercions (estimate, position), the optional `completedAt` ISO branch, and the
 * pass-through of the `extras` (childCount / labelIds / overdue).
 */
const baseRow: WorkItemRowLike = {
  id: 'wi-1',
  number: 42,
  projectId: 'p-1',
  title: 'Fix the meter',
  description: 'honey vs planned',
  statusId: 's-1',
  priority: 'HIGH',
  source: 'WEB',
  assigneeId: 'u-1',
  reporterId: 'u-2',
  parentId: null,
  estimateValue: '3.5',
  startDate: '2026-06-01',
  endDate: null,
  dueDate: '2026-06-10',
  position: '1024',
  version: 2,
  completedAt: new Date('2026-06-09T10:00:00.000Z'),
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-06-08T00:00:00.000Z'),
};

describe('toWorkItemDto', () => {
  it('derives the display key and coerces numeric/date fields', () => {
    const dto = toWorkItemDto(baseRow, 'RYT', {
      childCount: 3,
      labelIds: ['l-1', 'l-2'],
      overdue: true,
    });
    expect(dto.key).toBe('RYT-42');
    expect(dto.estimateValue).toBe(3.5);
    expect(dto.position).toBe(1024);
    expect(dto.completedAt).toBe('2026-06-09T10:00:00.000Z');
    expect(dto.createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(dto.childCount).toBe(3);
    expect(dto.labelIds).toEqual(['l-1', 'l-2']);
    expect(dto.overdue).toBe(true);
  });

  it('maps null estimate/position/completedAt to null and omits extras by default', () => {
    const dto = toWorkItemDto(
      { ...baseRow, estimateValue: null, position: null, completedAt: null },
      'RYT',
    );
    expect(dto.estimateValue).toBeNull();
    expect(dto.position).toBeNull();
    expect(dto.completedAt).toBeNull();
    expect(dto.childCount).toBeUndefined();
    expect(dto.labelIds).toBeUndefined();
    expect(dto.overdue).toBeUndefined();
  });
});
