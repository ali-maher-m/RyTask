import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './common/database/database.module';
import { AuthGuard } from './common/guards/auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RedisModule } from './common/redis/redis.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    TenancyModule,
    HealthModule,
  ],
  providers: [
    // Pipeline is wired now; the guards are permissive STUBS that M0 fills in
    // (real JWT/PAT auth + org resolution). See each guard's TODO.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule {}
