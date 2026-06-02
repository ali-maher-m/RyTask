import { Controller, Get } from '@nestjs/common';
import type { HealthStatus, Readiness } from '@rytask/contracts';
import { Public } from '../../../common/rbac/decorators';
import { HealthService } from '../services/health.service';

/**
 * Infra probes mounted at the root (excluded from the /api/v1 global prefix). `@Public` so
 * the M0 AuthGuard does not require a token for liveness/readiness checks.
 */
@Public()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('healthz')
  liveness(): HealthStatus {
    return this.health.liveness();
  }

  @Get('readyz')
  readiness(): Promise<Readiness> {
    return this.health.readiness();
  }
}
