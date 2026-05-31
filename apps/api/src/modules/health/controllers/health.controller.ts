import { Controller, Get } from '@nestjs/common';
import type { HealthStatus, Readiness } from '@rytask/contracts';
import { HealthService } from '../services/health.service';

/** Routes are mounted at the root (excluded from the /api/v1 global prefix). */
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
