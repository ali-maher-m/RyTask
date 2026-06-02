import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  type AuthResult,
  type LoginRequest,
  type RefreshRequest,
  type RegisterRequest,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '@rytask/contracts';
import type { Request } from 'express';
import { Public, RequirePermission } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import type { RequestContext } from '../providers/login.provider';
import { LoginProvider } from '../providers/login.provider';
import { LogoutProvider } from '../providers/logout.provider';
import { RefreshProvider } from '../providers/refresh.provider';
import { RegisterProvider } from '../providers/register.provider';

const reqContext = (req: Request): RequestContext => ({
  userAgent: req.headers['user-agent'] ?? null,
  ip: req.ip ?? null,
});

/**
 * Auth REST surface under /api/v1 (contracts/openapi.yaml, FR-AUTH-001/002). Register/login/
 * refresh are `@Public` (no token); logout requires the caller's own session (`self`). Invalid
 * credentials return a generic 401 (no enumeration). Tenant/identity come from the principal.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerProvider: RegisterProvider,
    private readonly loginProvider: LoginProvider,
    private readonly refreshProvider: RefreshProvider,
    private readonly logoutProvider: LogoutProvider,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  register(
    @Body(new ZodValidationPipe<RegisterRequest>(registerSchema)) body: RegisterRequest,
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.registerProvider.register(body, reqContext(req));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe<LoginRequest>(loginSchema)) body: LoginRequest,
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.loginProvider.login(body, reqContext(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe<RefreshRequest>(refreshSchema)) body: RefreshRequest,
    @Req() req: Request,
  ): Promise<AuthResult> {
    return this.refreshProvider.refresh(body, reqContext(req));
  }

  @RequirePermission('self')
  @Post('logout')
  @HttpCode(204)
  async logout(): Promise<void> {
    await this.logoutProvider.logout();
  }
}
