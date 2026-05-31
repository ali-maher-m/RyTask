import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { ViewsRepository } from '../repositories/views.repository';

/**
 * Delete a saved view (US5, FR-VIEW-008). Same mutate rule as update: the owner may
 * delete their own view; a SHARED project view may also be deleted by a project MEMBER
 * (openapi `x-rbac: project:member`). A PERSONAL view is owner-only.
 */
@Injectable()
export class DeleteViewProvider {
  constructor(
    private readonly views: ViewsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async delete(id: string): Promise<void> {
    const principalId = this.tenant.getUserId();
    if (!principalId) {
      throw new BadRequestException('no authenticated principal');
    }
    const existing = await this.views.findById(id);
    if (!existing) {
      throw new NotFoundException(`view ${id} not found`);
    }
    if (existing.ownerId !== principalId) {
      if (existing.scope === 'SHARED' && existing.projectId) {
        await this.access.assertRole(existing.projectId, 'MEMBER');
      } else {
        throw new ForbiddenException('only the owner can delete this view');
      }
    }
    await this.views.delete(id);
  }
}
