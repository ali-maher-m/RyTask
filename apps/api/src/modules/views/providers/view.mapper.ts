import type { View } from '@rytask/contracts';
import type { ViewRow } from '../repositories/views.repository';

/** Map a persisted `views` row to the API `View` DTO (JSON columns passed through). */
export function toViewDto(row: ViewRow): View {
  return {
    id: row.id,
    ownerId: row.ownerId,
    projectId: row.projectId,
    name: row.name,
    kind: row.kind,
    scope: row.scope,
    filters: (row.filters ?? {}) as Record<string, unknown>,
    grouping: (row.grouping ?? null) as Record<string, unknown> | null,
    sort: (row.sort ?? []) as Array<Record<string, unknown>>,
    layout: (row.layout ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
