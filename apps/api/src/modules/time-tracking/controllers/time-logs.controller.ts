import {
  Body,
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
  type CreateTimeLogInput,
  type ListTimeLogsQuery,
  type TimeLogEnvelope,
  type TimeLogListResponse,
  type UpdateTimeLogInput,
  createTimeLogSchema,
  listTimeLogsQuerySchema,
  updateTimeLogSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { CreateTimeLogProvider } from '../providers/create-time-log.provider';
import { DeleteTimeLogProvider } from '../providers/delete-time-log.provider';
import { ListTimeLogsProvider } from '../providers/list-time-logs.provider';
import { UpdateTimeLogProvider } from '../providers/update-time-log.provider';

/**
 * Time-log REST surface (US3/US4, contracts/time-rest.md §Time-log routes) under /api/v1. Manual
 * entries (`source` forced `MANUAL` server-side), the per-item entries list (keyset), and owner-or-admin
 * edit/delete. `work:write` gates the mutations + item access lives in the providers; `work:read` gates
 * the list. Edit/delete add their owner-or-admin default-deny in US4. The tenant/principal is resolved
 * server-side; an optional `Idempotency-Key` makes create replay-safe. MCP v2 deferral — no MCP tool.
 */
@RequirePermission('work:read')
@Controller()
export class TimeLogsController {
  constructor(
    private readonly createProvider: CreateTimeLogProvider,
    private readonly listProvider: ListTimeLogsProvider,
    private readonly updateProvider: UpdateTimeLogProvider,
    private readonly deleteProvider: DeleteTimeLogProvider,
    private readonly tenant: TenantContextService,
  ) {}

  @RequirePermission('work:write')
  @Post('work-items/:workItemId/time-logs')
  @HttpCode(201)
  async create(
    @Param('workItemId', new ParseUUIDPipe()) workItemId: string,
    @Body(new ZodValidationPipe<CreateTimeLogInput>(createTimeLogSchema)) body: CreateTimeLogInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimeLogEnvelope> {
    const data = await this.createProvider.create(workItemId, body, idempotencyKey);
    return { data };
  }

  @Get('work-items/:workItemId/time-logs')
  list(
    @Param('workItemId', new ParseUUIDPipe()) workItemId: string,
    @Query(new ZodValidationPipe<ListTimeLogsQuery>(listTimeLogsQuerySchema))
    query: ListTimeLogsQuery,
  ): Promise<TimeLogListResponse> {
    const userId = this.tenant.getUserId() ?? '';
    return this.listProvider.list(workItemId, userId, query.limit, query.cursor ?? null);
  }

  @RequirePermission('work:write')
  @Patch('time-logs/:id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<UpdateTimeLogInput>(updateTimeLogSchema)) body: UpdateTimeLogInput,
  ): Promise<TimeLogEnvelope> {
    const data = await this.updateProvider.update(id, body);
    return { data };
  }

  @RequirePermission('work:write')
  @Delete('time-logs/:id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.deleteProvider.delete(id);
  }
}
