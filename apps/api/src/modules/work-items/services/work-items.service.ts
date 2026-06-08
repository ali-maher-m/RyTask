import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  ActivityEntry,
  AddSubtask,
  CreateWorkItemInput,
  CreateWorkItemResponse,
  ListWorkItemsQuery,
  MoveWorkItem,
  UpdateWorkItem,
  WorkItem,
  WorkItemListResponse,
} from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { PROJECT_ACCESS, type ProjectAccessService } from '../../projects/projects.contract';
import { extractMentions } from '../domain/markdown';
import { isOverdue } from '../domain/overdue.policy';
import { toWorkItemDto } from '../domain/work-item.mapper';
import { WorkItemChangedEvent } from '../events/work-item.changed.event';
import { WorkItemCreatedEvent } from '../events/work-item.created.event';
import { WorkItemMentionedEvent } from '../events/work-item.mentioned.event';
import { type AddLabelInput, AddLabelProvider } from '../providers/add-label.provider';
import { AddSubtaskProvider } from '../providers/add-subtask.provider';
import { CreateWorkItemProvider } from '../providers/create-work-item.provider';
import { DeleteRestoreWorkItemProvider } from '../providers/delete-restore-work-item.provider';
import { ListWorkItemsProvider } from '../providers/list-work-items.provider';
import { MoveWorkItemProvider } from '../providers/move-work-item.provider';
import { MyWorkProvider } from '../providers/my-work.provider';
import { RemoveLabelProvider } from '../providers/remove-label.provider';
import { UpdateWorkItemProvider } from '../providers/update-work-item.provider';
import { ActivityRepository } from '../repositories/activity.repository';
import { WorkItemWatchersRepository } from '../repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../repositories/work-items.repository';

/**
 * Work-items application service — the module's public surface (Principle III). Wires
 * providers, maps rows to DTOs, and publishes domain events. Controllers and (future)
 * MCP tools both call this — no parallel logic. Grows across US1 (create) and US2
 * (update/delete/restore/activity/labels).
 */
@Injectable()
export class WorkItemsService {
  constructor(
    private readonly createProvider: CreateWorkItemProvider,
    private readonly updateProvider: UpdateWorkItemProvider,
    private readonly deleteRestoreProvider: DeleteRestoreWorkItemProvider,
    private readonly moveProvider: MoveWorkItemProvider,
    private readonly listProvider: ListWorkItemsProvider,
    private readonly myWorkProvider: MyWorkProvider,
    private readonly addSubtaskProvider: AddSubtaskProvider,
    private readonly addLabelProvider: AddLabelProvider,
    private readonly removeLabelProvider: RemoveLabelProvider,
    private readonly workItems: WorkItemsRepository,
    private readonly activity: ActivityRepository,
    @Inject(PROJECT_ACCESS) private readonly access: ProjectAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: EventEmitter2,
    private readonly tenant: TenantContextService,
    private readonly watchers: WorkItemWatchersRepository,
  ) {}

  async create(input: CreateWorkItemInput): Promise<CreateWorkItemResponse> {
    const { item, keyPrefix, labelIds, unresolved } = await this.createProvider.create(input);
    this.events.emit(
      WorkItemCreatedEvent.eventName,
      new WorkItemCreatedEvent(
        item.id,
        item.organizationId,
        item.projectId,
        item.reporterId,
        item.assigneeId,
      ),
    );
    await this.notifyDescriptionMentions(item);
    return { data: toWorkItemDto(item, keyPrefix, { labelIds }), meta: { unresolved } };
  }

  /**
   * Create a sub-task under an existing item (US6, FR-HIER-001). Cycle/depth are checked
   * before the write; the child inherits the parent's project. Emits the same created
   * event as a top-level create so notifications/watchers fire identically.
   */
  async addSubtask(parentId: string, input: AddSubtask): Promise<CreateWorkItemResponse> {
    const { item, keyPrefix, labelIds, unresolved } = await this.addSubtaskProvider.addSubtask(
      parentId,
      input,
    );
    this.events.emit(
      WorkItemCreatedEvent.eventName,
      new WorkItemCreatedEvent(
        item.id,
        item.organizationId,
        item.projectId,
        item.reporterId,
        item.assigneeId,
      ),
    );
    await this.notifyDescriptionMentions(item);
    return { data: toWorkItemDto(item, keyPrefix, { labelIds }), meta: { unresolved } };
  }

  /**
   * List the direct sub-tasks of an item (US6, FR-HIER-001). Read requires project:viewer.
   * Each child carries its own `childCount` + `overdue` so a tree can render nested counts.
   */
  async listSubtasks(parentId: string): Promise<WorkItemListResponse> {
    const parent = await this.workItems.findById(parentId);
    if (!parent) {
      throw new NotFoundException(`work item ${parentId} not found`);
    }
    await this.access.assertRole(parent.item.projectId, 'VIEWER');
    const children = await this.workItems.listChildren(parentId);
    if (children.length === 0) {
      return { data: [], pageInfo: { nextCursor: null, hasNextPage: false } };
    }
    const counts = await this.workItems.childCountsFor(children.map((c) => c.id));
    const today = this.clock.now().toISOString().slice(0, 10);
    const data = children.map((row) =>
      toWorkItemDto(row, parent.keyPrefix, {
        childCount: counts.get(row.id) ?? 0,
        overdue: isOverdue({ dueDate: row.dueDate, today, completedAt: row.completedAt }),
      }),
    );
    return { data, pageInfo: { nextCursor: null, hasNextPage: false } };
  }

  async update(id: string, input: UpdateWorkItem): Promise<{ data: WorkItem }> {
    const { item, keyPrefix, labelIds, changedFields } = await this.updateProvider.update(
      id,
      input,
    );
    this.emitChanged(item, changedFields);
    if (changedFields.includes('description')) {
      await this.notifyDescriptionMentions(item);
    }
    return { data: toWorkItemDto(item, keyPrefix, { labelIds }) };
  }

  async delete(id: string): Promise<void> {
    await this.deleteRestoreProvider.delete(id);
  }

  async restore(id: string): Promise<{ data: WorkItem }> {
    const { item, keyPrefix, labelIds } = await this.deleteRestoreProvider.restore(id);
    return { data: toWorkItemDto(item, keyPrefix, { labelIds }) };
  }

  /** Board move: change status and/or fractional position (US3, FR-VIEW-001). */
  async move(id: string, input: MoveWorkItem): Promise<{ data: WorkItem }> {
    const { item, keyPrefix, labelIds, changedFields } = await this.moveProvider.move(id, input);
    this.emitChanged(item, changedFields);
    return { data: toWorkItemDto(item, keyPrefix, { labelIds }) };
  }

  /**
   * Publish a `work-item.changed` event for an edit/move so notifications can fan out
   * STATUS_CHANGED (to watchers) and ASSIGNED (to a new assignee) — FR-NOTIF-001. A no-op edit
   * (no changed fields) emits nothing. The actor is the acting user (suppressed from their own
   * notifications); the post-change `version` is the per-change dedupe bucket.
   */
  private emitChanged(
    item: { id: string; organizationId: string; assigneeId: string | null; version: number },
    changedFields: string[],
  ): void {
    if (changedFields.length === 0) return;
    this.events.emit(
      WorkItemChangedEvent.eventName,
      new WorkItemChangedEvent(
        item.id,
        item.organizationId,
        this.tenant.getUserId() ?? null,
        item.assigneeId,
        item.version,
        changedFields,
      ),
    );
  }

  /**
   * Resolve @mentions in a work item's markdown description, grant the mentioned users MENTIONED
   * read access, and notify the newly-mentioned ones (US2, FR-COLLAB-002) — descriptions now
   * notify just like comments. Only users not already mentioned on the item are notified, so a
   * later edit doesn't re-notify; the actor never notifies themselves.
   */
  private async notifyDescriptionMentions(item: {
    id: string;
    organizationId: string;
    projectId: string;
    description: string | null;
    version: number;
  }): Promise<void> {
    if (!item.description) return;
    const handles = extractMentions(item.description);
    if (handles.length === 0) return;
    const actorId = this.tenant.getUserId() ?? null;
    const resolved = await this.watchers.resolveMentions(handles, item.projectId);
    const alreadyMentioned = new Set(
      (await this.watchers.listForItem(item.id))
        .filter((w) => w.reason === 'MENTIONED')
        .map((w) => w.userId),
    );
    const fresh = resolved.filter((userId) => userId !== actorId && !alreadyMentioned.has(userId));
    if (fresh.length === 0) return;
    await this.watchers.addMentioned(item.id, fresh);
    this.events.emit(
      WorkItemMentionedEvent.eventName,
      new WorkItemMentionedEvent(item.organizationId, item.id, actorId, item.version, fresh),
    );
  }

  /**
   * List / Board / smart-view read path (US3, FR-VIEW-*). RBAC enforced in the provider. The
   * cross-project `my-work` smart view routes through MyWorkProvider (US4) — a thin delegation
   * that reuses the same list path with `assignee = me` across accessible projects.
   */
  async list(query: ListWorkItemsQuery): Promise<WorkItemListResponse> {
    if (query.smart === 'my-work') {
      return this.myWorkProvider.myWork(query);
    }
    return this.listProvider.list(query);
  }

  /**
   * Get a single work item (full payload incl. labels, child count, overdue). Read requires
   * project:viewer. `childCount` lets the UI badge a parent without a separate round-trip.
   */
  async get(id: string): Promise<{ data: WorkItem }> {
    const found = await this.workItems.findById(id);
    if (!found) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(found.item.projectId, 'VIEWER');
    const [labelIds, childCount] = await Promise.all([
      this.workItems.labelIdsFor(id),
      this.workItems.childCount(id),
    ]);
    const today = this.clock.now().toISOString().slice(0, 10);
    const overdue = isOverdue({
      dueDate: found.item.dueDate,
      today,
      completedAt: found.item.completedAt,
    });
    return { data: toWorkItemDto(found.item, found.keyPrefix, { labelIds, childCount, overdue }) };
  }

  async addLabel(id: string, input: AddLabelInput): Promise<{ labelId: string }> {
    return this.addLabelProvider.addLabel(id, input);
  }

  async removeLabel(id: string, labelId: string): Promise<void> {
    await this.removeLabelProvider.removeLabel(id, labelId);
  }

  /** Per-item activity / history feed (FR-WI-009). Read requires project:viewer. */
  async listActivity(id: string): Promise<{ data: ActivityEntry[] }> {
    const item = await this.workItems.findById(id);
    if (!item) {
      throw new NotFoundException(`work item ${id} not found`);
    }
    await this.access.assertRole(item.item.projectId, 'VIEWER');
    const rows = await this.activity.listForItem(id);
    return {
      data: rows.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        action: r.action,
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
