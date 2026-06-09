import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TimeLogListResponse } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { toTimeLog } from '../domain/time.mapper';
import { type TimeLogRow, TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * List a work item's time entries (US2/US4 — keyset, newest first, soft-deleted excluded). Read
 * requires `work:read` AND project-viewer access; a MENTIONED watcher also has read access
 * (FR-COLLAB-002) even without project membership, so a non-member falls back to the mention grant
 * (the list-comments pattern). The cursor is opaque (`base64url` of the last row's `startedAt`+`id`).
 */
@Injectable()
export class ListTimeLogsProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
  ) {}

  async list(
    workItemId: string,
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<TimeLogListResponse> {
    const item = await this.workItems.getItemContext(workItemId);
    if (!item) throw new NotFoundException('work item not found');
    const role = await this.projects.getRole(item.projectId);
    if (!role && !(await this.workItems.canAccess(workItemId, userId))) {
      // Not a member and not a mentioned watcher → reuse assertRole to throw 403.
      await this.projects.assertRole(item.projectId, 'VIEWER');
    }

    const rows = await this.timeLogs.listPageForItem(workItemId, limit, decodeCursor(cursor));
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasNextPage && last ? encodeCursor(last) : null;
    return { data: page.map(toTimeLog), pageInfo: { nextCursor, hasNextPage } };
  }
}

/** Opaque keyset cursor = base64url(JSON{ s: startedAt ISO, i: id }). */
function encodeCursor(row: TimeLogRow): string {
  return Buffer.from(JSON.stringify({ s: row.startedAt.toISOString(), i: row.id })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string | null): { startedAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      s?: unknown;
      i?: unknown;
    };
    if (typeof parsed.s !== 'string' || typeof parsed.i !== 'string') return null;
    const startedAt = new Date(parsed.s);
    if (Number.isNaN(startedAt.getTime())) return null;
    return { startedAt, id: parsed.i };
  } catch {
    return null; // a malformed cursor is treated as "from the start" rather than a 500
  }
}
