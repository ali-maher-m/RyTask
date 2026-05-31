import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { CreateProject, Project } from '@rytask/contracts';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { validateProject } from '../domain/project.policy';
import { ProjectsRepository } from '../repositories/projects.repository';
import { toProjectDto } from './project.mapper';

/** Postgres unique-violation code (duplicate key prefix per workspace). */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Create a project (US4, FR-PROJ-001). Validates name/key-prefix format via the pure policy,
 * then runs the whole create — project row + `project_counter` + the six categorized default
 * statuses + the creator's ADMIN membership — in ONE transaction (the repository owns the tx).
 * A duplicate `(org, workspace, key_prefix)` rolls back and maps to 409. RBAC: any org member
 * may create a project (`org:member`); creation is not gated on a pre-existing project role.
 */
@Injectable()
export class CreateProjectProvider {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly tenant: TenantContextService,
  ) {}

  async create(input: CreateProject): Promise<Project> {
    const decision = validateProject({ name: input.name, keyPrefix: input.keyPrefix });
    if (!decision.ok) {
      throw new BadRequestException(
        decision.reason === 'NAME_LENGTH'
          ? 'name must be 1–120 characters'
          : 'keyPrefix must match ^[A-Z][A-Z0-9]{1,9}$',
      );
    }

    const creatorId = this.tenant.getUserId() ?? null;
    try {
      const row = await this.projects.createTx(
        {
          name: input.name.trim(),
          keyPrefix: input.keyPrefix,
          description: input.description ?? null,
          icon: input.icon ?? null,
          color: input.color,
          leadId: input.leadId ?? null,
        },
        creatorId,
      );
      return toProjectDto(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`a project with key prefix ${input.keyPrefix} already exists`);
      }
      throw err;
    }
  }
}

/** True iff the error is a Postgres unique-constraint violation (duplicate key prefix). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
