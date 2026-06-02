import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { Workspace } from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { WorkspacesService } from '../services/workspaces.service';

/**
 * Workspaces REST surface under /api/v1 (contracts/openapi.yaml, FR-TEN-002). Reads require
 * `workspace:read`; enforcement goes live in US4. Tenant comes from the principal.
 */
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @RequirePermission('workspace:read')
  @Get()
  list(): Promise<Workspace[]> {
    return this.service.list();
  }

  @RequirePermission('workspace:read')
  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<Workspace> {
    return this.service.get(id);
  }
}
