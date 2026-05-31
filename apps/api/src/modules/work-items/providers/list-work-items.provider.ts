import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ListWorkItemsQuery, WorkItem } from '@rytask/contracts';
import { type SQL, and } from 'drizzle-orm';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import {
  type CompileContext,
  type FilterNode,
  type QueryColumns,
  type SortKey,
  buildKeysetPredicate,
  buildOrderBy,
  compileFilter,
  cursorFromRow,
  decodeCursor,
  smartViewAst,
  validateFilter,
} from '../../views/views.contract';
import { isOverdue } from '../domain/overdue.policy';
import { toWorkItemDto } from '../domain/work-item.mapper';
import { WorkItemsRepository } from '../repositories/work-items.repository';

export interface WorkItemListResult {
  data: WorkItem[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

/**
 * List / Board / smart-view read path (US3, FR-VIEW-001/002/006/007/009/010). Compiles
 * the filter AST + multi-key sort + keyset cursor via the SHARED query engine
 * (views.contract); the repository supplies the Drizzle column bindings and runs the
 * query (it owns `@rytask/db`). Default-excludes trashed items, scopes to the projects
 * the principal can read, and derives `overdue` for the board/list. RBAC: a single
 * `projectId` requires VIEWER on it; cross-project reads intersect accessible projects.
 */
@Injectable()
export class ListWorkItemsProvider {
  constructor(
    private readonly workItems: WorkItemsRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenant: TenantContextService,
  ) {}

  async list(query: ListWorkItemsQuery): Promise<WorkItemListResult> {
    const principalId = this.tenant.getUserId() ?? '';
    const today = this.today();

    // ── permission scope: a named project (VIEWER) or the accessible set ─────────
    let accessible: string[] | undefined;
    if (query.projectId) {
      await this.access.assertRole(query.projectId, 'VIEWER');
    } else {
      accessible = await this.access.accessibleProjectIds();
      if (accessible.length === 0) {
        return { data: [], pageInfo: { nextCursor: null, hasNextPage: false } };
      }
    }

    const filter = this.resolveFilter(query);
    if (filter) {
      validateFilter(filter);
    }

    const sort = this.parseSort(query.sort);
    const cursorValues = query.cursor ? decodeCursor(query.cursor) : undefined;
    // The board groups by status client-side; M1 returns the flat keyset page. The
    // explicit sort wins (default: number asc); the engine appends `id` for a total order.
    const effectiveSort: SortKey[] = sort.length > 0 ? sort : [{ field: 'number', dir: 'asc' }];

    const rows = await this.workItems.listForView({
      limit: query.limit,
      projectId: query.projectId,
      accessibleProjectIds: accessible,
      build: (columns: QueryColumns) => {
        const ctx: CompileContext = { columns, principalId, today };
        const parts: SQL[] = [];
        if (filter) {
          const compiled = compileFilter(filter, ctx);
          if (compiled) parts.push(compiled);
        }
        if (cursorValues) {
          const keyset = buildKeysetPredicate(effectiveSort, cursorValues, ctx);
          if (keyset) parts.push(keyset);
        }
        const where =
          parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : (and(...parts) as SQL);
        return { where, orderBy: buildOrderBy(effectiveSort, ctx) };
      },
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;

    const data = await this.toDtos(page, today);
    const last = page[page.length - 1];
    const nextCursor = hasNextPage && last ? cursorFromRow(last, effectiveSort) : null;

    return { data, pageInfo: { nextCursor, hasNextPage } };
  }

  /** Resolve the effective filter AST: a smart view, a base64 AST, or none. */
  private resolveFilter(query: ListWorkItemsQuery): FilterNode | undefined {
    if (query.smart) {
      // Code-defined smart views (D7) live in the shared views module so List/Board and
      // the views surface resolve them identically. `me` binds at compile time.
      return smartViewAst(query.smart, this.today());
    }
    if (query.filter) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(query.filter, 'base64').toString('utf8'));
      } catch {
        throw new BadRequestException('filter must be base64-encoded JSON');
      }
      return parsed as FilterNode;
    }
    return undefined;
  }

  /** Parse `-priority,due_date` style sort into SortKey[] (filter-dsl.md). */
  private parseSort(raw: string | undefined): SortKey[] {
    if (!raw) return [];
    const fields = new Set([
      'priority',
      'dueDate',
      'startDate',
      'endDate',
      'createdAt',
      'updatedAt',
      'number',
    ]);
    const keys: SortKey[] = [];
    for (const token of raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)) {
      const dir = token.startsWith('-') ? 'desc' : 'asc';
      const name = this.camel(token.replace(/^[-+]/, ''));
      if (!fields.has(name)) {
        throw new BadRequestException(`unsortable field "${name}"`);
      }
      keys.push({ field: name as SortKey['field'], dir });
    }
    return keys;
  }

  private camel(s: string): string {
    return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
  }

  private async toDtos(
    rows: Awaited<ReturnType<WorkItemsRepository['listForView']>>,
    today: string,
  ): Promise<WorkItem[]> {
    if (rows.length === 0) return [];
    const keyPrefixes = await this.workItems.keyPrefixesFor(rows.map((r) => r.projectId));
    return rows.map((row) => {
      // Single source of the overdue rule (FR-DATE-003). The flat list row carries
      // `completedAt` (not the joined status category), so the policy falls back to it.
      const overdue = isOverdue({ dueDate: row.dueDate, today, completedAt: row.completedAt });
      return toWorkItemDto(row, keyPrefixes.get(row.projectId) ?? '', { overdue });
    });
  }

  /** Org-tz "today" as YYYY-MM-DD from the Clock (org-tz config lands later; UTC in M1). */
  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}
