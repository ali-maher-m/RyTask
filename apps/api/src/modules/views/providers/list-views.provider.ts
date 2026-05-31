import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { View } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { ViewsRepository } from '../repositories/views.repository';
import { toViewDto } from './view.mapper';

/**
 * List the saved views VISIBLE to the principal (US5, FR-VIEW-008): their own PERSONAL
 * views plus SHARED views in projects they can access. When `projectId` is given the
 * caller must hold project VIEWER (openapi `x-rbac: project:viewer`) and the list is
 * narrowed to that project (cross-project views still surface). Smart views are not rows.
 */
@Injectable()
export class ListViewsProvider {
  constructor(
    private readonly views: ViewsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async list(projectId?: string): Promise<View[]> {
    const ownerId = this.tenant.getUserId();
    if (!ownerId) {
      throw new BadRequestException('no authenticated principal');
    }
    if (projectId) {
      await this.access.assertRole(projectId, 'VIEWER');
    }
    const accessibleProjectIds = await this.access.accessibleProjectIds();
    const rows = await this.views.listVisible({ ownerId, accessibleProjectIds, projectId });
    return rows.map(toViewDto);
  }
}
