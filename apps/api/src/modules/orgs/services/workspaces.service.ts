import { Injectable } from '@nestjs/common';
import type { Workspace } from '@rytask/contracts';
import { WorkspacesProvider } from '../providers/workspaces.provider';

/** Workspaces application service (US1, FR-TEN-002). */
@Injectable()
export class WorkspacesService {
  constructor(private readonly workspaces: WorkspacesProvider) {}

  list(): Promise<Workspace[]> {
    return this.workspaces.list();
  }

  get(id: string): Promise<Workspace> {
    return this.workspaces.get(id);
  }
}
