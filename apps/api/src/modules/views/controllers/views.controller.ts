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
  type SaveView,
  type UpdateView,
  type ViewListResponse,
  type ViewResponse,
  saveViewSchema,
  updateViewSchema,
} from '@rytask/contracts';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ViewsService } from '../services/views.service';

/**
 * Saved-views REST surface under /api/v1 (contracts/openapi.yaml, FR-VIEW-008). RBAC is
 * enforced in the providers: listing requires project VIEWER (when scoped to a project);
 * save/update/delete require project MEMBER (or view ownership). PERSONAL views are
 * visible only to their owner; SHARED views to project members. Smart views are not rows
 * (D7) — they live on `GET /work-items?smart=`. Tenant/org from the principal.
 */
@RequirePermission('work:read')
@Controller('views')
export class ViewsController {
  constructor(private readonly service: ViewsService) {}

  @Get()
  list(@Query('projectId') projectId?: string): Promise<ViewListResponse> {
    return this.service.list(projectId);
  }

  @RequirePermission('work:write')
  @Post()
  @HttpCode(201)
  save(
    @Body(new ZodValidationPipe<SaveView>(saveViewSchema)) body: SaveView,
  ): Promise<ViewResponse> {
    return this.service.save(body);
  }

  @RequirePermission('work:write')
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe<UpdateView>(updateViewSchema)) body: UpdateView,
  ): Promise<ViewResponse> {
    return this.service.update(id, body);
  }

  @RequirePermission('work:write')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
