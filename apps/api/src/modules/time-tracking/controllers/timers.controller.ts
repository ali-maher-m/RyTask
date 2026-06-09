import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type ActiveTimer,
  type ActiveTimerResponse,
  type StartTimerInput,
  type TimeLogEnvelope,
  startTimerSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { GetActiveTimerProvider } from '../providers/get-active-timer.provider';
import { StartTimerProvider } from '../providers/start-timer.provider';
import { StopTimerProvider } from '../providers/stop-timer.provider';

/**
 * Timer REST surface (US1, contracts/time-rest.md §Timer routes) under /api/v1. The tenant + acting
 * user are resolved server-side from the principal (never the body). `work:write` gates start/stop;
 * `work:read` gates the active-timer read. Item access + the one-active-timer logic live in the
 * providers; an optional `Idempotency-Key` makes start/stop replay-safe. These capabilities are an
 * intentional MCP v2 deferral — no MCP tool (parity stays 49/49, research D12 / FR-FIN-004).
 */
@RequirePermission('work:read')
@Controller()
export class TimersController {
  constructor(
    private readonly startProvider: StartTimerProvider,
    private readonly stopProvider: StopTimerProvider,
    private readonly getActiveProvider: GetActiveTimerProvider,
  ) {}

  @RequirePermission('work:write')
  @Post('work-items/:workItemId/timer/start')
  @HttpCode(201)
  async start(
    @Param('workItemId', new ParseUUIDPipe()) workItemId: string,
    @Body(new ZodValidationPipe<StartTimerInput>(startTimerSchema)) body: StartTimerInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ data: ActiveTimer }> {
    const data = await this.startProvider.start(workItemId, body.note ?? null, idempotencyKey);
    return { data };
  }

  @RequirePermission('work:write')
  @Post('timers/:id/stop')
  @HttpCode(201)
  async stop(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimeLogEnvelope> {
    const data = await this.stopProvider.stop(id, idempotencyKey);
    return { data };
  }

  @Get('timers/active')
  async active(): Promise<ActiveTimerResponse> {
    return { data: await this.getActiveProvider.getActive() };
  }
}
