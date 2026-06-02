import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../../../common/ports/clock.port';
import type { DueWorkItem, WorkItemAccessService } from '../../work-items/work-items.contract';
import { DueScanProcessor } from './due-scan.processor';

/**
 * Unit tests for the due-soon/overdue scan (FR-NOTIF-001) — the time-windowed notifications that
 * were previously never produced. The processor turns the cross-tenant read-model into one
 * dispatch job per assigned candidate, bucketed by `kind:dueDate` so each fires once per day.
 */
const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) });

function make(due: DueWorkItem[]): DueScanProcessor {
  const workItems = {
    listDueAndOverdue: vi.fn(async () => due),
  } as unknown as WorkItemAccessService;
  return new DueScanProcessor(workItems, fixedClock('2026-06-02T09:00:00.000Z'));
}

describe('DueScanProcessor.computeJobs', () => {
  it('produces a DUE_SOON/OVERDUE dispatch job per assigned candidate, bucketed by date', async () => {
    const proc = make([
      {
        organizationId: 'o1',
        workItemId: 'w1',
        assigneeId: 'u1',
        dueDate: '2026-06-01',
        title: 'Late',
        key: 'RY-1',
        kind: 'OVERDUE',
      },
      {
        organizationId: 'o1',
        workItemId: 'w2',
        assigneeId: 'u2',
        dueDate: '2026-06-03',
        title: 'Soon',
        key: 'RY-2',
        kind: 'DUE_SOON',
      },
    ]);
    const jobs = await proc.computeJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      type: 'OVERDUE',
      recipientIds: ['u1'],
      bucket: 'OVERDUE:2026-06-01',
      organizationId: 'o1',
    });
    expect(jobs[1]).toMatchObject({
      type: 'DUE_SOON',
      recipientIds: ['u2'],
      bucket: 'DUE_SOON:2026-06-03',
    });
  });

  it('skips unassigned items (no recipient for a due reminder)', async () => {
    const proc = make([
      {
        organizationId: 'o1',
        workItemId: 'w3',
        assigneeId: null,
        dueDate: '2026-06-01',
        title: 'Orphan',
        key: 'RY-3',
        kind: 'OVERDUE',
      },
    ]);
    expect(await proc.computeJobs()).toHaveLength(0);
  });
});
