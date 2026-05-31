import type { Priority, WorkItem } from '@rytask/contracts';

/** Structural row shape the mapper reads (decoupled from the Drizzle row / @rytask/db). */
export interface WorkItemRowLike {
  id: string;
  number: number;
  projectId: string;
  title: string;
  description: string | null;
  statusId: string;
  priority: string;
  assigneeId: string | null;
  reporterId: string | null;
  parentId: string | null;
  estimateValue: string | null;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  position: string | null;
  version: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItemExtras {
  labelIds?: string[];
  childCount?: number;
  overdue?: boolean;
}

/** Map a persisted row to the API `WorkItem`, deriving the display key `{prefix}-{number}`. */
export function toWorkItemDto(
  row: WorkItemRowLike,
  keyPrefix: string,
  extras: WorkItemExtras = {},
): WorkItem {
  return {
    id: row.id,
    key: `${keyPrefix}-${row.number}`,
    number: row.number,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    statusId: row.statusId,
    priority: row.priority as Priority,
    assigneeId: row.assigneeId,
    reporterId: row.reporterId,
    parentId: row.parentId,
    childCount: extras.childCount,
    labelIds: extras.labelIds,
    estimateValue: row.estimateValue != null ? Number(row.estimateValue) : null,
    startDate: row.startDate,
    endDate: row.endDate,
    dueDate: row.dueDate,
    overdue: extras.overdue,
    position: row.position != null ? Number(row.position) : null,
    version: row.version,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
