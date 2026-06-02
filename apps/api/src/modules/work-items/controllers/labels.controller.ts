import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  type CreateLabel,
  type Label,
  type LabelListResponse,
  createLabelSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { LabelsService } from '../services/labels.service';

/**
 * Workspace-labels REST surface (GET|POST /labels, contracts/openapi.yaml, FR-LBL-001).
 * Labels are workspace-scoped; the tenant/workspace is resolved from the principal. The
 * `.strict()` create schema rejects unknown fields → 400.
 */
@RequirePermission('work:read')
@Controller('labels')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get()
  list(): Promise<LabelListResponse> {
    return this.service.list();
  }

  @RequirePermission('work:write')
  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe<CreateLabel>(createLabelSchema)) body: CreateLabel,
  ): Promise<{ data: Label }> {
    return this.service.create(body);
  }
}
