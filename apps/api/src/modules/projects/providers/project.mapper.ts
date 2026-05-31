import type { Project } from '@rytask/contracts';
import type { ProjectRow } from '../repositories/projects.repository';

/** Map a persisted project row to the API `Project` DTO (OpenAPI `Project`). */
export function toProjectDto(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    description: row.description,
    icon: row.icon,
    color: row.color,
    leadId: row.leadId,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
