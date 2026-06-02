import { Injectable, NotFoundException } from '@nestjs/common';
import type { Workspace } from '@rytask/contracts';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { toWorkspaceDto } from './org.mapper';

/** List / get workspaces in the current org (US1, FR-TEN-002). Tenant-scoped. */
@Injectable()
export class WorkspacesProvider {
  constructor(private readonly workspaces: WorkspacesRepository) {}

  async list(): Promise<Workspace[]> {
    return (await this.workspaces.list()).map(toWorkspaceDto);
  }

  async get(id: string): Promise<Workspace> {
    const row = await this.workspaces.findById(id);
    if (!row) {
      throw new NotFoundException('workspace not found');
    }
    return toWorkspaceDto(row);
  }
}
