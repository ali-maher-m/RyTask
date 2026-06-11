import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { WorkspaceExportDto } from '@rytask/contracts';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { ExportRepository } from '../repositories/export.repository';

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * Assemble the complete workspace archive (M5, FR-PORT-003/004, AC-12). Read-only by contract
 * (FR-015 discipline): no writes, no activity, no notifications — the provider only maps
 * tenant-scoped snapshot reads into the versioned `WorkspaceExportDto`. Soft-deleted rows ship
 * WITH their `deletedAt` so the archive is a safe exit, and `counts` lets the reader (and the
 * tests) check completeness at a glance.
 */
@Injectable()
export class WorkspaceExportProvider {
  constructor(
    private readonly repo: ExportRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async export(): Promise<WorkspaceExportDto> {
    const organization = await this.repo.organization();
    if (!organization) {
      throw new NotFoundException('organization not found');
    }
    const [wss, members, projects, statuses, labels, items, itemLabels, comments, timeLogs] =
      await Promise.all([
        this.repo.workspaces(),
        this.repo.members(),
        this.repo.projects(),
        this.repo.statuses(),
        this.repo.labels(),
        this.repo.workItems(),
        this.repo.workItemLabels(),
        this.repo.comments(),
        this.repo.timeLogs(),
      ]);

    const labelsByItem = new Map<string, string[]>();
    for (const link of itemLabels) {
      const list = labelsByItem.get(link.workItemId) ?? [];
      list.push(link.labelId);
      labelsByItem.set(link.workItemId, list);
    }

    return {
      format: 'rytask.workspace-export',
      version: 1,
      exportedAt: iso(this.clock.now()),
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        settings: organization.settings,
        createdAt: iso(organization.createdAt),
      },
      workspaces: wss.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        createdAt: iso(w.createdAt),
      })),
      members: members.map((m) => ({
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: m.role,
        deactivatedAt: isoOrNull(m.deactivatedAt),
        createdAt: iso(m.createdAt),
      })),
      projects: projects.map((p) => ({
        id: p.id,
        workspaceId: p.workspaceId,
        name: p.name,
        keyPrefix: p.keyPrefix,
        description: p.description,
        color: p.color,
        leadId: p.leadId,
        archivedAt: isoOrNull(p.archivedAt),
        createdAt: iso(p.createdAt),
      })),
      statuses: statuses.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        category: s.category,
        color: s.color,
        position: s.position,
      })),
      labels: labels.map((l) => ({
        id: l.id,
        workspaceId: l.workspaceId,
        name: l.name,
        color: l.color,
      })),
      workItems: items.map(({ item, keyPrefix }) => ({
        id: item.id,
        projectId: item.projectId,
        key: `${keyPrefix}-${item.number}`,
        number: item.number,
        title: item.title,
        description: item.description,
        statusId: item.statusId,
        priority: item.priority,
        source: item.source,
        assigneeId: item.assigneeId,
        reporterId: item.reporterId,
        parentId: item.parentId,
        labelIds: labelsByItem.get(item.id) ?? [],
        estimateValue: item.estimateValue,
        startDate: item.startDate,
        endDate: item.endDate,
        dueDate: item.dueDate,
        completedAt: isoOrNull(item.completedAt),
        createdAt: iso(item.createdAt),
        updatedAt: iso(item.updatedAt),
        deletedAt: isoOrNull(item.deletedAt),
      })),
      comments: comments.map((c) => ({
        id: c.id,
        workItemId: c.workItemId,
        authorId: c.authorId,
        parentId: c.parentId,
        body: c.body,
        createdAt: iso(c.createdAt),
        editedAt: isoOrNull(c.editedAt),
        deletedAt: isoOrNull(c.deletedAt),
      })),
      timeLogs: timeLogs.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        workItemId: t.workItemId,
        userId: t.userId,
        startedAt: iso(t.startedAt),
        endedAt: iso(t.endedAt),
        durationSeconds: t.durationSeconds,
        note: t.note,
        billable: t.billable,
        source: t.source,
        classification: t.classification,
        classificationOverridden: t.classificationOverridden,
        createdAt: iso(t.createdAt),
        deletedAt: isoOrNull(t.deletedAt),
      })),
      counts: {
        workspaces: wss.length,
        members: members.length,
        projects: projects.length,
        statuses: statuses.length,
        labels: labels.length,
        workItems: items.length,
        comments: comments.length,
        timeLogs: timeLogs.length,
      },
    };
  }
}
