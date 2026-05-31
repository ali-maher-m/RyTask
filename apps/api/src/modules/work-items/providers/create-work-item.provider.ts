import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { CreateWorkItem, Priority, UnresolvedToken } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { parseQuickAdd } from '../domain/quick-add.parser';
import { LabelsRepository } from '../repositories/labels.repository';
import { type CreatedWorkItem, WorkItemsRepository } from '../repositories/work-items.repository';

export interface CreateWorkItemResult extends CreatedWorkItem {
  labelIds: string[];
  unresolved: UnresolvedToken[];
}

/**
 * Capture a work item (US1, FR-WI-001/002/004). One transaction (in the repository):
 * mint a never-recycled key → insert with project defaults → apply labels/assignee/
 * watchers → append CREATED activity. Quick-add tokens are parsed here; unresolved
 * tokens are surfaced, never dropped (SC-002).
 */
@Injectable()
export class CreateWorkItemProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    private readonly labels: LabelsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenant: TenantContextService,
  ) {}

  async create(input: CreateWorkItem): Promise<CreateWorkItemResult> {
    const projectId = input.projectId;
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }
    // RBAC: create requires project:member (org admins bypass).
    await this.access.assertRole(projectId, 'MEMBER');

    const unresolved: UnresolvedToken[] = [];
    let title = input.title?.trim() ?? '';
    let priority: Priority = input.priority ?? 'NONE';
    let dueDate: string | null = input.dueDate ?? null;
    let assigneeId: string | null = input.assigneeId ?? null;
    const labelIds = [...(input.labelIds ?? [])];

    if (input.quickAdd) {
      const parsed = parseQuickAdd(input.quickAdd, { referenceDate: this.clock.now() });
      title = parsed.title || title;
      if (!input.priority && parsed.priority) priority = parsed.priority;
      if (!input.dueDate && parsed.dueDate) dueDate = parsed.dueDate;
      unresolved.push(...parsed.unresolved);

      for (const name of parsed.labels) {
        labelIds.push(await this.labels.findOrCreateByName(name));
      }
      for (const handle of parsed.assignees) {
        const resolved = await this.workItems.resolveAssignee(handle, projectId);
        if (resolved) {
          assigneeId = resolved; // single-assignee in M1 (last wins)
        } else {
          unresolved.push({ token: `@${handle}`, kind: 'assignee' });
        }
      }
    }

    if (!title) {
      throw new BadRequestException('title is required');
    }

    const statusId = input.statusId ?? (await this.workItems.findDefaultStatusId(projectId));
    if (!statusId) {
      throw new BadRequestException('project has no status to default to');
    }

    const reporterId = this.tenant.getUserId() ?? null;
    const watchers: Array<{ userId: string; reason: 'AUTHOR' | 'ASSIGNEE' }> = [];
    if (reporterId) watchers.push({ userId: reporterId, reason: 'AUTHOR' });
    if (assigneeId) watchers.push({ userId: assigneeId, reason: 'ASSIGNEE' });

    const created = await this.workItems.createWorkItem({
      projectId,
      title,
      description: input.description ?? null,
      statusId,
      priority,
      assigneeId,
      reporterId,
      parentId: input.parentId ?? null,
      estimateValue: input.estimateValue != null ? String(input.estimateValue) : null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      dueDate,
      labelIds: [...new Set(labelIds)],
      watchers,
    });

    return { ...created, labelIds: [...new Set(labelIds)], unresolved };
  }
}
