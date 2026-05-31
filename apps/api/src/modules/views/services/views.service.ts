import { Injectable } from '@nestjs/common';
import type { SaveView, UpdateView, View, ViewListResponse, ViewResponse } from '@rytask/contracts';
import { DeleteViewProvider } from '../providers/delete-view.provider';
import { ListViewsProvider } from '../providers/list-views.provider';
import { SaveViewProvider } from '../providers/save-view.provider';
import { UpdateViewProvider } from '../providers/update-view.provider';

/**
 * Views application service — the views module's public surface (Principle III).
 * Controllers and (future) MCP tools both call this; no parallel logic (ADR-006). RBAC,
 * the personal/shared visibility policy, and filter-AST validation live in the providers.
 */
@Injectable()
export class ViewsService {
  constructor(
    private readonly listProvider: ListViewsProvider,
    private readonly saveProvider: SaveViewProvider,
    private readonly updateProvider: UpdateViewProvider,
    private readonly deleteProvider: DeleteViewProvider,
  ) {}

  async list(projectId?: string): Promise<ViewListResponse> {
    return { data: await this.listProvider.list(projectId) };
  }

  async save(input: SaveView): Promise<ViewResponse> {
    return { data: await this.saveProvider.save(input) };
  }

  async update(id: string, input: UpdateView): Promise<ViewResponse> {
    return { data: await this.updateProvider.update(id, input) };
  }

  async delete(id: string): Promise<void> {
    await this.deleteProvider.delete(id);
  }
}
