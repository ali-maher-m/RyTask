import { Module } from '@nestjs/common';
import { HealthController } from './controllers/health.controller';
import { HealthRepository } from './repositories/health.repository';
import { HealthService } from './services/health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository],
})
export class HealthModule {}
