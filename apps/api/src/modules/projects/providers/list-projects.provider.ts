import { Inject, Injectable } from '@nestjs/common';
import type { Project } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectsRepository } from '../repositories/projects.repository';
import { toProjectDto } from './project.mapper';

export interface ListProjectsResult {
  data: Project[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/**
 * List the projects the principal can access in the current workspace (US4, FR-PROJ-001).
 * Org admins see every project; otherwise the page is restricted to the principal's
 * memberships. Archived projects are hidden unless `includeArchived`. Keyset cursor on id.
 */
@Injectable()
export class ListProjectsProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    private readonly tenant: TenantContextService,
  ) {}

  async list(opts: {
    limit: number;
    cursor?: string;
    includeArchived: boolean;
  }): Promise<ListProjectsResult> {
    const workspaceId = this.tenant.get().workspaceId;
    if (!workspaceId) {
      return { data: [], pageInfo: { nextCursor: null, hasNextPage: false } };
    }

    const rows = await this.projects.listForWorkspace({
      workspaceId,
      limit: opts.limit,
      cursorId: opts.cursor,
      includeArchived: opts.includeArchived,
    });

    // Keyset window from the DB rows (cursor advances on the raw row order, FR-PROJ-001).
    const hasNextPage = rows.length > opts.limit;
    const window = hasNextPage ? rows.slice(0, opts.limit) : rows;
    const last = window[window.length - 1];
    const nextCursor = hasNextPage && last ? last.id : null;

    // Restrict to accessible projects unless the principal is an org admin (non-member 403).
    let page = window;
    if (!this.tenant.get().isOrgAdmin) {
      const accessible = new Set(await this.access.accessibleProjectIds());
      page = window.filter((r) => accessible.has(r.id));
    }

    return {
      data: page.map(toProjectDto),
      pageInfo: { nextCursor, hasNextPage },
    };
  }
}
