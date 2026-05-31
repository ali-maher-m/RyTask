import { Injectable } from '@nestjs/common';
import type {
  AddMember,
  CreateProject,
  MemberListResponse,
  ProjectListResponse,
  ProjectResponse,
  UpdateProject,
} from '@rytask/contracts';
import { CreateProjectProvider } from '../providers/create-project.provider';
import { DeleteProjectProvider } from '../providers/delete-project.provider';
import { GetProjectProvider } from '../providers/get-project.provider';
import { ListProjectsProvider } from '../providers/list-projects.provider';
import { MembershipProvider } from '../providers/membership.provider';
import { UpdateProjectProvider } from '../providers/update-project.provider';

/**
 * Projects application service — the projects module's project surface (Principle III).
 * Controllers and (future) MCP tools both call this; no parallel logic (ADR-006). RBAC and
 * the create transaction live in the providers.
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly createProvider: CreateProjectProvider,
    private readonly listProvider: ListProjectsProvider,
    private readonly getProvider: GetProjectProvider,
    private readonly updateProvider: UpdateProjectProvider,
    private readonly deleteProvider: DeleteProjectProvider,
    private readonly membership: MembershipProvider,
  ) {}

  async list(opts: {
    limit: number;
    cursor?: string;
    includeArchived: boolean;
  }): Promise<ProjectListResponse> {
    return this.listProvider.list(opts);
  }

  async get(projectId: string): Promise<ProjectResponse> {
    return { data: await this.getProvider.get(projectId) };
  }

  async create(input: CreateProject): Promise<ProjectResponse> {
    return { data: await this.createProvider.create(input) };
  }

  async update(projectId: string, input: UpdateProject): Promise<ProjectResponse> {
    return { data: await this.updateProvider.update(projectId, input) };
  }

  async delete(projectId: string): Promise<void> {
    await this.deleteProvider.delete(projectId);
  }

  async listMembers(projectId: string): Promise<MemberListResponse> {
    const data = await this.membership.list(projectId);
    return { data, pageInfo: { nextCursor: null, hasNextPage: false } };
  }

  async addMember(projectId: string, input: AddMember): Promise<void> {
    await this.membership.add(projectId, input);
  }
}
