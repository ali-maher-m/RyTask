import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateStatus,
  type ReorderStatuses,
  type Status,
  type StatusListResponse,
  type UpdateStatus,
  createStatusSchema,
  reorderStatusesSchema,
  updateStatusSchema,
} from '@rytask/contracts';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { StatusesService } from '../services/statuses.service';

/**
 * Statuses REST surface under /api/v1 (contracts/openapi.yaml, FR-WF-001/002). Project-
 * scoped list/create/reorder live under /projects/{projectId}/statuses; rename/delete are
 * addressed by status id under /statuses/{statusId}. RBAC is enforced in the provider:
 * reads require project VIEWER; every mutation requires project ADMIN. Deleting a status
 * that still has items requires `reassignTo` (else 409). Tenant/org from the principal.
 */
@Controller()
export class StatusesController {
  constructor(private readonly service: StatusesService) {}

  @Get('projects/:projectId/statuses')
  list(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<StatusListResponse> {
    return this.service.list(projectId);
  }

  @Post('projects/:projectId/statuses')
  @HttpCode(201)
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodValidationPipe<CreateStatus>(createStatusSchema)) body: CreateStatus,
  ): Promise<{ data: Status }> {
    return this.service.create(projectId, body);
  }

  @Post('projects/:projectId/statuses/reorder')
  @HttpCode(200)
  reorder(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodValidationPipe<ReorderStatuses>(reorderStatusesSchema)) body: ReorderStatuses,
  ): Promise<StatusListResponse> {
    return this.service.reorder(projectId, body);
  }

  @Patch('statuses/:statusId')
  update(
    @Param('statusId', new ParseUUIDPipe()) statusId: string,
    @Body(new ZodValidationPipe<UpdateStatus>(updateStatusSchema)) body: UpdateStatus,
  ): Promise<{ data: Status }> {
    return this.service.update(statusId, body);
  }

  @Delete('statuses/:statusId')
  @HttpCode(204)
  async remove(
    @Param('statusId', new ParseUUIDPipe()) statusId: string,
    @Query('reassignTo') reassignTo?: string,
  ): Promise<void> {
    await this.service.delete(statusId, reassignTo ?? null);
  }
}
