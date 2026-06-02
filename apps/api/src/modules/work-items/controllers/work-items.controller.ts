import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type ActivityEntry,
  type AddSubtask,
  type CreateWorkItem,
  type CreateWorkItemResponse,
  type ListWorkItemsQuery,
  type MoveWorkItem,
  type UpdateWorkItem,
  type WorkItem,
  type WorkItemListResponse,
  addSubtaskSchema,
  createWorkItemSchema,
  listWorkItemsQuerySchema,
  moveWorkItemSchema,
  updateWorkItemSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { VersionConflictError } from '../repositories/work-items.repository';
import { WorkItemsService } from '../services/work-items.service';

/**
 * Work-items REST surface under /api/v1 (contracts/openapi.yaml). RBAC is enforced in the
 * providers via the project access port; the tenant/org is resolved server-side from the
 * principal (never the body). A stale optimistic `version` (VersionConflictError) maps to
 * HTTP 409 (FR-WI-009). `Idempotency-Key` is accepted now; the replay store is wired later.
 */
@RequirePermission('work:read')
@Controller('work-items')
export class WorkItemsController {
  constructor(private readonly service: WorkItemsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe<ListWorkItemsQuery>(listWorkItemsQuerySchema))
    query: ListWorkItemsQuery,
  ): Promise<WorkItemListResponse> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ data: WorkItem }> {
    return this.service.get(id);
  }

  @RequirePermission('work:write')
  @Post(':id/move')
  @HttpCode(200)
  async move(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<MoveWorkItem>(moveWorkItemSchema)) body: MoveWorkItem,
  ): Promise<{ data: WorkItem }> {
    try {
      return await this.service.move(id, body);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        throw new ConflictException('work item was modified by someone else (stale version)');
      }
      throw err;
    }
  }

  @RequirePermission('work:write')
  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe<CreateWorkItem>(createWorkItemSchema)) body: CreateWorkItem,
    @Headers('idempotency-key') _idempotencyKey?: string,
  ): Promise<CreateWorkItemResponse> {
    if (!body.title && !body.quickAdd) {
      throw new BadRequestException('either title or quickAdd is required');
    }
    return this.service.create(body);
  }

  @RequirePermission('work:write')
  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<UpdateWorkItem>(updateWorkItemSchema)) body: UpdateWorkItem,
  ): Promise<{ data: WorkItem }> {
    try {
      return await this.service.update(id, body);
    } catch (err) {
      if (err instanceof VersionConflictError) {
        throw new ConflictException('work item was modified by someone else (stale version)');
      }
      throw err;
    }
  }

  @RequirePermission('work:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(id);
  }

  @RequirePermission('work:write')
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ data: WorkItem }> {
    return this.service.restore(id);
  }

  @Get(':id/subtasks')
  listSubtasks(@Param('id', new ParseUUIDPipe()) id: string): Promise<WorkItemListResponse> {
    return this.service.listSubtasks(id);
  }

  @RequirePermission('work:write')
  @Post(':id/subtasks')
  @HttpCode(201)
  addSubtask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<AddSubtask>(addSubtaskSchema)) body: AddSubtask,
  ): Promise<CreateWorkItemResponse> {
    if (!body.title && !body.quickAdd) {
      throw new BadRequestException('either title or quickAdd is required');
    }
    return this.service.addSubtask(id, body);
  }

  @Get(':id/activity')
  activity(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ data: ActivityEntry[] }> {
    return this.service.listActivity(id);
  }

  @RequirePermission('work:write')
  @Post(':id/labels')
  @HttpCode(201)
  addLabel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { labelId?: string; name?: string },
  ): Promise<{ labelId: string }> {
    if (!body || (!body.labelId && !body.name)) {
      throw new BadRequestException('labelId or name is required');
    }
    return this.service.addLabel(id, { labelId: body.labelId, name: body.name });
  }

  @RequirePermission('work:write')
  @Delete(':id/labels/:labelId')
  @HttpCode(204)
  async removeLabel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('labelId', new ParseUUIDPipe()) labelId: string,
  ): Promise<void> {
    await this.service.removeLabel(id, labelId);
  }
}
