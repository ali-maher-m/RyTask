import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectsRepository } from '../repositories/projects.repository';

/**
 * Hard-delete a project (US4, FR-PROJ-001). RBAC: ADMIN. The FK cascades remove the
 * project's members, counter, statuses, and work items (with their labels/watchers/
 * activity). A missing project is 404. Archive (retain-but-hide) is the non-destructive
 * alternative — delete is irreversible.
 */
@Injectable()
export class DeleteProjectProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
  ) {}

  async delete(projectId: string): Promise<void> {
    await this.access.assertRole(projectId, 'ADMIN');
    const deleted = await this.projects.delete(projectId);
    if (!deleted) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
  }
}
