import { Injectable } from '@nestjs/common';
import type {
  CreateStatus,
  ReorderStatuses,
  Status,
  StatusListResponse,
  UpdateStatus,
} from '@rytask/contracts';
import { StatusesProvider } from '../providers/statuses.provider';

/**
 * Statuses application service — the projects module's status surface (Principle III).
 * Controllers and (future) MCP tools both call this; no parallel logic (ADR-006). RBAC
 * + the delete-remap policy live in the provider.
 */
@Injectable()
export class StatusesService {
  constructor(private readonly provider: StatusesProvider) {}

  async list(projectId: string): Promise<StatusListResponse> {
    return { data: await this.provider.list(projectId) };
  }

  async create(projectId: string, input: CreateStatus): Promise<{ data: Status }> {
    return { data: await this.provider.create(projectId, input) };
  }

  async update(statusId: string, input: UpdateStatus): Promise<{ data: Status }> {
    return { data: await this.provider.update(statusId, input) };
  }

  async reorder(projectId: string, input: ReorderStatuses): Promise<StatusListResponse> {
    return { data: await this.provider.reorder(projectId, input) };
  }

  async delete(statusId: string, reassignTo: string | null): Promise<void> {
    await this.provider.delete(statusId, reassignTo);
  }
}
