import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateView, View } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { type UpdateViewColumns, ViewsRepository } from '../repositories/views.repository';
import { type FilterNode, validateFilter } from '../views.contract';
import { toViewDto } from './view.mapper';

/**
 * Update a saved view (US5, FR-VIEW-008). The owner may always edit their own view; a
 * SHARED project view may also be edited by a project MEMBER (openapi `x-rbac:
 * project:member`) since it is a team artifact. A PERSONAL view is private to its owner.
 * The filter AST is re-validated on every change (→ 400 on malformed input).
 */
@Injectable()
export class UpdateViewProvider {
  constructor(
    private readonly views: ViewsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async update(id: string, input: UpdateView): Promise<View> {
    const principalId = this.tenant.getUserId();
    if (!principalId) {
      throw new BadRequestException('no authenticated principal');
    }
    const existing = await this.views.findById(id);
    if (!existing) {
      throw new NotFoundException(`view ${id} not found`);
    }
    await this.assertCanMutate(existing, principalId);

    if (input.filters && Object.keys(input.filters).length > 0) {
      validateFilter(input.filters as unknown as FilterNode);
    }

    const columns: UpdateViewColumns = {};
    if (input.name !== undefined) columns.name = input.name;
    if (input.kind !== undefined) columns.kind = input.kind;
    if (input.scope !== undefined) columns.scope = input.scope;
    if (input.filters !== undefined) columns.filters = input.filters;
    if (input.grouping !== undefined) columns.grouping = input.grouping;
    if (input.sort !== undefined) columns.sort = input.sort;
    if (input.layout !== undefined) columns.layout = input.layout;

    const updated = await this.views.update(id, columns);
    if (!updated) {
      throw new NotFoundException(`view ${id} not found`);
    }
    return toViewDto(updated);
  }

  /** Owner-or-(shared-project-member) can mutate; a PERSONAL view is owner-only. */
  private async assertCanMutate(
    view: { ownerId: string; scope: string; projectId: string | null },
    principalId: string,
  ): Promise<void> {
    if (view.ownerId === principalId) {
      return;
    }
    if (view.scope === 'SHARED' && view.projectId) {
      await this.access.assertRole(view.projectId, 'MEMBER');
      return;
    }
    throw new ForbiddenException('only the owner can modify this view');
  }
}
