import { Injectable } from '@nestjs/common';
import type { ListWorkItemsQuery } from '@rytask/contracts';
import { ListWorkItemsProvider, type WorkItemListResult } from './list-work-items.provider';

/**
 * Cross-project "My Work" read (US4, FR-PROJ-002): every item assigned to the principal
 * across the projects they can access. This is a thin delegation to the shared list path —
 * the `my-work` smart view (`assignee = me`, projectId omitted) already intersects with the
 * principal's accessible projects in {@link ListWorkItemsProvider}, so the query logic lives
 * in ONE place (no duplication). Non-members never appear because they have no membership and
 * thus no accessible projects to read.
 */
@Injectable()
export class MyWorkProvider {
  constructor(private readonly list: ListWorkItemsProvider) {}

  /** Items assigned to the current principal across accessible projects (keyset paginated). */
  async myWork(query: ListWorkItemsQuery): Promise<WorkItemListResult> {
    return this.list.list({ ...query, smart: 'my-work', projectId: undefined });
  }
}
