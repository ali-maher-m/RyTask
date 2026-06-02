import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { type AuthResult, type BootstrapRequest, type SetupState, bootstrapSchema } from '@rytask/contracts';
import { Public } from '../../../common/rbac/decorators';
import { ZodValidationPipe } from '../../../common/validation/zod-validation.pipe';
import { BootstrapFirstRunProvider } from '../providers/bootstrap-first-run.provider';

/**
 * First-run REST surface (contracts/openapi.yaml, FR-AUTH-010). Both routes are `@Public`
 * (no token) and only meaningful while the instance is un-bootstrapped: `POST /setup`
 * returns 409 once an org exists. Bootstrapping signs the owner in (returns an AuthResult).
 */
@Controller('setup')
export class SetupController {
  constructor(private readonly bootstrap: BootstrapFirstRunProvider) {}

  @Public()
  @Get()
  async state(): Promise<SetupState> {
    return { available: await this.bootstrap.isAvailable() };
  }

  @Public()
  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe<BootstrapRequest>(bootstrapSchema)) body: BootstrapRequest,
  ): Promise<AuthResult> {
    return this.bootstrap.bootstrap(body);
  }
}
