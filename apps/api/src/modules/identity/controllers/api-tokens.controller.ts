import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import {
  type ApiTokenDto,
  type ApiTokenSecret,
  type CreateApiToken,
  createApiTokenSchema,
} from '@rytask/contracts';
import type { RequestWithPrincipal } from '../../../common/auth/principal';
import { RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { ApiTokensProvider } from '../providers/api-tokens.provider';

/**
 * Personal Access Token REST surface (contracts/openapi.yaml, FR-AUTH-007). A holder manages
 * their **own** tokens — every role holds `tokens:read`/`tokens:write` (rbac-matrix); the
 * provider scopes to the principal so one user never sees another's. The mint secret is
 * returned once (SC-002).
 */
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly tokens: ApiTokensProvider) {}

  @RequirePermission('tokens:read')
  @Get()
  list(@Req() req: RequestWithPrincipal): Promise<ApiTokenDto[]> {
    return this.tokens.list(req.principal as NonNullable<RequestWithPrincipal['principal']>);
  }

  @RequirePermission('tokens:write')
  @Post()
  @HttpCode(201)
  create(
    @Req() req: RequestWithPrincipal,
    @Body(new ZodValidationPipe<CreateApiToken>(createApiTokenSchema)) body: CreateApiToken,
  ): Promise<ApiTokenSecret> {
    return this.tokens.issue(req.principal as NonNullable<RequestWithPrincipal['principal']>, body);
  }

  @RequirePermission('tokens:write')
  @Delete(':id')
  @HttpCode(204)
  revoke(@Req() req: RequestWithPrincipal, @Param('id') id: string): Promise<void> {
    return this.tokens.revoke(req.principal as NonNullable<RequestWithPrincipal['principal']>, id);
  }
}
