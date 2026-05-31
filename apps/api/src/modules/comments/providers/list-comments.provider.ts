import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { WORK_ITEM_ACCESS, type WorkItemAccessService } from '../../work-items/work-items.contract';
import { type CommentRow, CommentsRepository } from '../repositories/comments.repository';

/**
 * List a work item's threaded comments (US7, FR-COLLAB-001). Read requires
 * project:viewer; a MENTIONED watcher also has read access (FR-COLLAB-002) even without
 * project membership, so non-members fall back to the mention-grant check.
 */
@Injectable()
export class ListCommentsProvider {
  constructor(
    private readonly comments: CommentsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(WORK_ITEM_ACCESS) private readonly workItems: WorkItemAccessService,
  ) {}

  async list(workItemId: string, userId: string): Promise<CommentRow[]> {
    const item = await this.workItems.getItemContext(workItemId);
    if (!item) {
      throw new NotFoundException(`work item ${workItemId} not found`);
    }
    const role = await this.access.getRole(item.projectId);
    if (!role && !(await this.workItems.canAccess(workItemId, userId))) {
      // Not a member and not a mentioned watcher → reuse assertRole to throw 403.
      await this.access.assertRole(item.projectId, 'VIEWER');
    }
    return this.comments.listForItem(workItemId);
  }
}
