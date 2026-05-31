import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { ActivityRepository } from '../repositories/activity.repository';
import { LabelsRepository } from '../repositories/labels.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';

/**
 * Detach a label from a work item (DELETE /work-items/{id}/labels/{labelId}, FR-LBL-001).
 * Logs a LABEL_REMOVED activity row. Idempotent. RBAC: project:member.
 */
@Injectable()
export class RemoveLabelProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    private readonly labels: LabelsRepository,
    private readonly activity: ActivityRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async removeLabel(workItemId: string, labelId: string): Promise<void> {
    const item = await this.workItems.findById(workItemId);
    if (!item) {
      throw new NotFoundException(`work item ${workItemId} not found`);
    }
    await this.access.assertRole(item.item.projectId, 'MEMBER');
    await this.labels.detach(workItemId, labelId);
    await this.activity.append({
      workItemId,
      actorId: this.tenant.getUserId() ?? null,
      action: 'LABEL_REMOVED',
      field: 'labelId',
      oldValue: labelId,
      newValue: null,
    });
  }
}
