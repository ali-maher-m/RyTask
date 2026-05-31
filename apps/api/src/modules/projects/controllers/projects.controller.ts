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
  type AddMember,
  type CreateProject,
  type MemberListResponse,
  type ProjectListResponse,
  type ProjectResponse,
  type UpdateProject,
  addMemberSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@rytask/contracts';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ProjectsService } from '../services/projects.service';

/**
 * Projects REST surface under /api/v1 (contracts/openapi.yaml, FR-PROJ-001/002). Reads
 * require project VIEWER, mutations ADMIN — except create, which is open to any org member.
 * RBAC + the create transaction + the duplicate-prefix → 409 mapping all live in the
 * providers. Tenant/org/workspace come from the principal (never the body).
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get()
  list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ProjectListResponse> {
    return this.service.list({
      limit: clampLimit(limit),
      cursor: cursor || undefined,
      includeArchived: includeArchived === 'true',
    });
  }

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe<CreateProject>(createProjectSchema)) body: CreateProject,
  ): Promise<ProjectResponse> {
    return this.service.create(body);
  }

  @Get(':projectId')
  get(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<ProjectResponse> {
    return this.service.get(projectId);
  }

  @Patch(':projectId')
  update(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodValidationPipe<UpdateProject>(updateProjectSchema)) body: UpdateProject,
  ): Promise<ProjectResponse> {
    return this.service.update(projectId, body);
  }

  @Delete(':projectId')
  @HttpCode(204)
  async remove(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<void> {
    await this.service.delete(projectId);
  }

  @Get(':projectId/members')
  listMembers(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<MemberListResponse> {
    return this.service.listMembers(projectId);
  }

  @Post(':projectId/members')
  @HttpCode(201)
  async addMember(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(new ZodValidationPipe<AddMember>(addMemberSchema)) body: AddMember,
  ): Promise<{ data: { userId: string; role: string } }> {
    await this.service.addMember(projectId, body);
    return { data: { userId: body.userId, role: body.role } };
  }
}

/** Clamp the list page size to 1..200 (default 50), matching the pagination contract. */
function clampLimit(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 50;
  if (Number.isNaN(n) || n < 1) return 50;
  return Math.min(n, 200);
}
