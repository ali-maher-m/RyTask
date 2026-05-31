import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectsRepository } from '../repositories/projects.repository';
import { toProjectDto } from './project.mapper';

/**
 * Archive / restore a project (US4, FR-PROJ-001). RBAC: ADMIN. Archiving sets `archived_at`
 * (hidden from default lists but fully retained); restoring clears it. The data is never
 * dropped — that is what `delete` is for. Used by the (future) MCP `archive_project` tool;
 * the PATCH route reaches the same toggle via UpdateProjectProvider.
 */
@Injectable()
export class ArchiveProjectProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async setArchived(projectId: string, archived: boolean): Promise<Project> {
    await this.access.assertRole(projectId, 'ADMIN');
    const row = await this.projects.update(projectId, {
      archivedAt: archived ? this.clock.now() : null,
    });
    if (!row) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
    return toProjectDto(row);
  }
}
