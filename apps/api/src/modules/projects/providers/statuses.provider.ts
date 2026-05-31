import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateStatus, ReorderStatuses, Status, UpdateStatus } from '@rytask/contracts';
import { evaluateStatusDelete } from '../domain/status.policy';
import { PROJECT_ACCESS, type ProjectAccessService } from '../projects.contract';
import { type StatusRow, StatusesRepository } from '../repositories/statuses.repository';

/** Map a persisted status row to the API `Status` DTO. */
function toStatusDto(row: StatusRow): Status {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color,
    position: row.position,
  };
}

/**
 * Statuses CRUD/reorder/delete-with-remap (US3, FR-WF-001/002). Reads require project
 * VIEWER; every mutation requires project ADMIN (RBAC matrix / openapi `x-rbac`). The
 * delete path enforces the pure policy (min-one + reassign) then re-maps items in one
 * transaction (the repository owns the tx). Status mutations never run cross-project.
 */
@Injectable()
export class StatusesProvider {
  constructor(
    private readonly statuses: StatusesRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
  ) {}

  /** List a project's statuses (board columns, ordered). RBAC: VIEWER. */
  async list(projectId: string): Promise<Status[]> {
    await this.access.assertRole(projectId, 'VIEWER');
    const rows = await this.statuses.listForProject(projectId);
    return rows.map(toStatusDto);
  }

  /** Add a status mapped to a category (appended unless a position is given). RBAC: ADMIN. */
  async create(projectId: string, input: CreateStatus): Promise<Status> {
    await this.access.assertRole(projectId, 'ADMIN');
    const row = await this.statuses.create({
      projectId,
      name: input.name,
      category: input.category,
      color: input.color,
      position: input.position,
    });
    return toStatusDto(row);
  }

  /** Rename / recolor / recategorize a status. RBAC: ADMIN. */
  async update(statusId: string, input: UpdateStatus): Promise<Status> {
    const existing = await this.statuses.findById(statusId);
    if (!existing) {
      throw new NotFoundException(`status ${statusId} not found`);
    }
    await this.access.assertRole(existing.projectId, 'ADMIN');
    const updated = await this.statuses.update(statusId, {
      name: input.name,
      category: input.category,
      color: input.color,
    });
    if (!updated) {
      throw new NotFoundException(`status ${statusId} not found`);
    }
    return toStatusDto(updated);
  }

  /** Apply a total ordering to a project's statuses (board column order). RBAC: ADMIN. */
  async reorder(projectId: string, input: ReorderStatuses): Promise<Status[]> {
    await this.access.assertRole(projectId, 'ADMIN');
    const current = await this.statuses.listForProject(projectId);
    const known = new Set(current.map((s) => s.id));
    if (
      input.orderedIds.length !== current.length ||
      input.orderedIds.some((id) => !known.has(id))
    ) {
      throw new BadRequestException(
        'orderedIds must list every status in the project exactly once',
      );
    }
    await this.statuses.reorder(projectId, input.orderedIds);
    const rows = await this.statuses.listForProject(projectId);
    return rows.map(toStatusDto);
  }

  /**
   * Delete a status, re-mapping its items to `reassignTo` when present (one transaction).
   * Enforces the pure policy first: a project keeps ≥1 status; a non-empty status needs a
   * valid `reassignTo` (else 409). RBAC: ADMIN.
   */
  async delete(statusId: string, reassignTo: string | null): Promise<void> {
    const existing = await this.statuses.findById(statusId);
    if (!existing) {
      throw new NotFoundException(`status ${statusId} not found`);
    }
    await this.access.assertRole(existing.projectId, 'ADMIN');

    const projectId = existing.projectId;
    const [totalStatuses, itemCount, allStatuses] = await Promise.all([
      this.statuses.countForProject(projectId),
      this.statuses.itemCount(statusId),
      this.statuses.listForProject(projectId),
    ]);
    const otherStatusIds = allStatuses.filter((s) => s.id !== statusId).map((s) => s.id);

    const decision = evaluateStatusDelete({
      totalStatuses,
      itemCount,
      statusId,
      reassignTo,
      otherStatusIds,
    });
    if (!decision.ok) {
      switch (decision.reason) {
        case 'LAST_STATUS':
          throw new ConflictException('a project must keep at least one status');
        case 'HAS_ITEMS_NEEDS_REASSIGN':
          throw new ConflictException(
            'status has work items; provide reassignTo to re-map them before deleting',
          );
        case 'REASSIGN_SAME':
          throw new BadRequestException('reassignTo must differ from the status being deleted');
        case 'REASSIGN_UNKNOWN':
          throw new BadRequestException('reassignTo must be another status in the same project');
      }
    }

    await this.statuses.deleteWithRemap(statusId, itemCount > 0 ? reassignTo : null);
  }
}
