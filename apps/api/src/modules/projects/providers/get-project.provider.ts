import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectsRepository } from '../repositories/projects.repository';
import { toProjectDto } from './project.mapper';

/**
 * Get a single project (US4, FR-PROJ-001/002). RBAC: VIEWER — a non-member (and not org
 * admin) is denied with 403 (FR-PROJ-002). A missing project is 404.
 */
@Injectable()
export class GetProjectProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
  ) {}

  async get(projectId: string): Promise<Project> {
    await this.access.assertRole(projectId, 'VIEWER');
    const row = await this.projects.findById(projectId);
    if (!row) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
    return toProjectDto(row);
  }
}
