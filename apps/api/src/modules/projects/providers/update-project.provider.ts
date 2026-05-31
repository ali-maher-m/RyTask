import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Project, UpdateProject } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectsRepository, type UpdateProjectColumns } from '../repositories/projects.repository';
import { toProjectDto } from './project.mapper';

/**
 * Update / archive / restore a project (US4, FR-PROJ-001). RBAC: ADMIN. The `archived`
 * boolean toggles `archived_at` (set = archived/hidden-but-retained, cleared = restored);
 * archive is also exposed as its own provider but routes through here for the PATCH path.
 */
@Injectable()
export class UpdateProjectProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async update(projectId: string, input: UpdateProject): Promise<Project> {
    await this.access.assertRole(projectId, 'ADMIN');

    const columns: UpdateProjectColumns = {};
    if (input.name !== undefined) columns.name = input.name.trim();
    if (input.description !== undefined) columns.description = input.description;
    if (input.icon !== undefined) columns.icon = input.icon;
    if (input.color !== undefined) columns.color = input.color;
    if (input.leadId !== undefined) columns.leadId = input.leadId;
    if (input.archived !== undefined) {
      columns.archivedAt = input.archived ? this.clock.now() : null;
    }

    const row = await this.projects.update(projectId, columns);
    if (!row) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
    return toProjectDto(row);
  }
}
