import { Inject, Injectable } from '@nestjs/common';
import type { HealthStatus, Readiness } from '@rytask/contracts';
import type { RedisPort } from '../../../common/ports/redis.port';
import { REDIS } from '../../../common/redis/redis.module';
import { deriveReadinessStatus } from '../domain/health.policy';
import { HealthRepository } from '../repositories/health.repository';

@Injectable()
export class HealthService {
  constructor(
    private readonly repo: HealthRepository,
    @Inject(REDIS) private readonly redis: RedisPort,
  ) {}

  /** Liveness — process is up; no dependency checks. */
  liveness(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? '0.0.0',
    };
  }

  /** Readiness — can the process serve traffic (DB + Redis reachable)? */
  async readiness(): Promise<Readiness> {
    const [dbUp, redisUp] = await Promise.all([this.repo.ping(), this.redis.ping()]);
    const checks: Readiness['checks'] = {
      database: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    };
    return { status: deriveReadinessStatus(checks), checks };
  }
}
