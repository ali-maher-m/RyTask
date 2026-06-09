import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateTimeLogInput, TimeLog } from '@rytask/contracts';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import {
  WORK_ITEM_ACCESS,
  type WorkItemAccessService,
  type WorkItemContext,
} from '../../work-items/work-items.contract';
import { resolveClassification } from '../domain/classification.policy';
import { type ResolvedEntry, resolveEntry } from '../domain/duration.policy';
import { toTimeLog } from '../domain/time.mapper';
import { TimeLogsRepository } from '../repositories/time-logs.repository';

/**
 * Create a manual time entry after the fact (US3, FR-TT-002/004 — research D5). `source` is forced to
 * `MANUAL` server-side; the two accepted forms (duration-only XOR start/end) are normalized to one
 * stored shape by `duration.policy` so a manual entry sums identically to a timer entry (SC-004); an
 * invalid form is a friendly `400` with nothing persisted. RBAC: the route requires `work:write`; this
 * also asserts project membership via the projects contract (org admins bypass) — the start-timer
 * pattern. Wrapped in `IdempotencyService.run`, so a retried create with the same key writes one entry.
 *
 * Classification is derived from the item's priority (`URGENT ⇒ INTERRUPTION`, else `PLANNED`) and
 * snapshotted, unless the caller supplies an explicit `classification` (then it wins and
 * `classificationOverridden = true`) — `classification.policy` (US5, research D6).
 */
@Injectable()
export class CreateTimeLogProvider {
  constructor(
    private readonly timeLogs: TimeLogsRepository,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
    @Inject(PROJECT_ACCESS) private readonly projects: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly idempotency: IdempotencyService,
    private readonly tenant: TenantContextService,
  ) {}

  async create(
    workItemId: string,
    input: CreateTimeLogInput,
    idempotencyKey?: string,
  ): Promise<TimeLog> {
    const ctx = await this.workItems.getItemContext(workItemId);
    if (!ctx) throw new NotFoundException('work item not found');
    await this.projects.assertRole(ctx.projectId, 'MEMBER');
    const userId = this.tenant.getUserId();
    if (!userId) throw new ForbiddenException('no acting user in context');

    const resolved = resolveEntry(input, this.clock.now());
    if (!resolved.ok) throw new BadRequestException(resolved.message);

    return this.idempotency.run(idempotencyKey, 'time.log.create', () =>
      this.persist(ctx, userId, input, resolved.entry),
    );
  }

  private async persist(
    ctx: WorkItemContext,
    userId: string,
    input: CreateTimeLogInput,
    entry: ResolvedEntry,
  ): Promise<TimeLog> {
    // Snapshot the class at creation (research D6): an explicit value wins (overridden), else derive
    // from the item's priority — so a later priority change never re-splits this entry's history.
    const { classification, classificationOverridden } = resolveClassification(
      input.classification,
      {
        priority: ctx.priority,
      },
    );
    const row = await this.timeLogs.create({
      workspaceId: ctx.workspaceId,
      projectId: ctx.projectId,
      workItemId: ctx.id,
      userId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
      note: input.note ?? null,
      billable: input.billable ?? false,
      source: 'MANUAL',
      classification,
      classificationOverridden,
    });
    await this.workItems.recordTimeLogged(ctx.id, userId, entry.durationSeconds);
    return toTimeLog(row);
  }
}
