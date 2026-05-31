import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SaveView, View } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { ViewsRepository } from '../repositories/views.repository';
import { type FilterNode, validateFilter } from '../views.contract';
import { toViewDto } from './view.mapper';

/**
 * Save a view (US5, FR-VIEW-008). The principal becomes the `owner`. A project-scoped
 * view requires the principal to be a project MEMBER (openapi `x-rbac: project:member`);
 * a cross-project view (null `projectId`) is the principal's own. The filter AST is
 * validated before persisting so a malformed view can never be stored (→ 400).
 */
@Injectable()
export class SaveViewProvider {
  constructor(
    private readonly views: ViewsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async save(input: SaveView): Promise<View> {
    const ownerId = this.tenant.getUserId();
    if (!ownerId) {
      throw new BadRequestException('no authenticated principal');
    }
    if (input.projectId) {
      await this.access.assertRole(input.projectId, 'MEMBER');
    }
    if (input.filters && Object.keys(input.filters).length > 0) {
      validateFilter(input.filters as unknown as FilterNode);
    }
    const row = await this.views.create({
      ownerId,
      projectId: input.projectId ?? null,
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      filters: input.filters,
      grouping: input.grouping,
      sort: input.sort,
      layout: input.layout,
    });
    return toViewDto(row);
  }
}
