import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AddSubtask } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { evaluateParenting } from '../domain/hierarchy.policy';
import { WorkItemsRepository } from '../repositories/work-items.repository';
import { CreateWorkItemProvider, type CreateWorkItemResult } from './create-work-item.provider';

/**
 * Add a sub-task under an existing item (US6, FR-HIER-001, research D4). The parent gives
 * the child its project (sub-tasks live in the parent's project) and the cycle/depth check
 * runs BEFORE any write: the new child is a fresh leaf, so the only failure mode is the
 * depth cap (the parent already sits as deep as its ancestor chain). The actual insert
 * reuses the create path (key mint + defaults + activity in one tx) with `parentId` set.
 * RBAC: project:member (delegated to the create provider, asserted again here for clarity).
 */
@Injectable()
export class AddSubtaskProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    private readonly createProvider: CreateWorkItemProvider,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
  ) {}

  async addSubtask(parentId: string, input: AddSubtask): Promise<CreateWorkItemResult> {
    const parent = await this.workItems.findById(parentId);
    if (!parent) {
      throw new NotFoundException(`work item ${parentId} not found`);
    }
    await this.access.assertRole(parent.item.projectId, 'MEMBER');

    // Depth/cycle guard before writing (FR-HIER-001). A fresh child is a leaf (height 1);
    // the parent's ancestor chain places it at parentDepth + 1.
    const parentAncestorIds = await this.workItems.ancestorIds(parentId);
    const decision = evaluateParenting({
      // The child does not exist yet; a sentinel id can never appear in the parent's chain,
      // so only the depth rule can trip here (self/cycle are structurally impossible).
      itemId: `new:${parentId}`,
      parentId,
      parentAncestorIds,
      subtreeHeight: 1,
    });
    if (!decision.ok) {
      throw new UnprocessableEntityException(decision.message);
    }

    if (!input.title && !input.quickAdd) {
      throw new BadRequestException('either title or quickAdd is required');
    }

    // Reuse the create path: parent's project + parentId; everything else mirrors create.
    return this.createProvider.create({
      projectId: parent.item.projectId,
      parentId,
      title: input.title,
      quickAdd: input.quickAdd,
      description: input.description,
      statusId: input.statusId,
      priority: input.priority,
      assigneeId: input.assigneeId,
      labelIds: input.labelIds,
      estimateValue: input.estimateValue,
      startDate: input.startDate,
      endDate: input.endDate,
      dueDate: input.dueDate,
    });
  }
}
