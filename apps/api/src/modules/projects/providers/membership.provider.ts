import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AddMember, ProjectMember } from '@rytask/contracts';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { ProjectMembersRepository } from '../repositories/project-members.repository';
import { ProjectsRepository } from '../repositories/projects.repository';

/**
 * Project membership management (US4, FR-PROJ-002). Listing members requires VIEWER; adding
 * a member requires ADMIN. A non-member (and not org admin) is denied with 403 — that is the
 * gate that makes a project's items unreadable to outsiders.
 */
@Injectable()
export class MembershipProvider {
  constructor(
    private readonly members: ProjectMembersRepository,
    private readonly projects: ProjectsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
  ) {}

  /** List a project's members (with display names). RBAC: VIEWER. */
  async list(projectId: string): Promise<ProjectMember[]> {
    await this.access.assertRole(projectId, 'VIEWER');
    const rows = await this.members.listForProject(projectId);
    return rows.map((r) => ({ userId: r.userId, role: r.role, name: r.name }));
  }

  /** Add a member to a project at a role (default MEMBER). RBAC: ADMIN. */
  async add(projectId: string, input: AddMember): Promise<void> {
    await this.access.assertRole(projectId, 'ADMIN');
    const project = await this.projects.findById(projectId);
    if (!project) {
      throw new NotFoundException(`project ${projectId} not found`);
    }
    await this.members.add(projectId, input.userId, input.role);
  }
}
