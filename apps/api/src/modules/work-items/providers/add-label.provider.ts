import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { ActivityRepository } from '../repositories/activity.repository';
import { LabelsRepository } from '../repositories/labels.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';

export interface AddLabelInput {
  labelId?: string;
  name?: string;
}

/**
 * Attach a label to a work item by id or name (POST /work-items/{id}/labels, FR-LBL-001).
 * Create-on-capture: a `name` with no matching label creates one (workspace-scoped).
 * Logs a LABEL_ADDED activity row. RBAC: project:member.
 */
@Injectable()
export class AddLabelProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    private readonly labels: LabelsRepository,
    private readonly activity: ActivityRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async addLabel(workItemId: string, input: AddLabelInput): Promise<{ labelId: string }> {
    const item = await this.workItems.findById(workItemId);
    if (!item) {
      throw new NotFoundException(`work item ${workItemId} not found`);
    }
    await this.access.assertRole(item.item.projectId, 'MEMBER');

    let labelId = input.labelId;
    if (!labelId) {
      if (!input.name) {
        throw new BadRequestException('labelId or name is required');
      }
      labelId = await this.labels.findOrCreateByName(input.name);
    } else {
      const exists = await this.labels.findById(labelId);
      if (!exists) {
        throw new NotFoundException(`label ${labelId} not found`);
      }
    }

    await this.labels.attach(workItemId, labelId);
    await this.activity.append({
      workItemId,
      actorId: this.tenant.getUserId() ?? null,
      action: 'LABEL_ADDED',
      field: 'labelId',
      oldValue: null,
      newValue: labelId,
    });
    return { labelId };
  }
}
