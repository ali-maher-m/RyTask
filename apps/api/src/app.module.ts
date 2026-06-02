import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { authConfig } from './common/config/auth.config';
import { DatabaseModule } from './common/database/database.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { ThrottleGuard } from './common/guards/throttle.guard';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { PortsModule } from './common/ports/ports.module';
import { RedisModule } from './common/redis/redis.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenantContextMiddleware } from './common/tenancy/tenant-context.middleware';
import { CommentsModule } from './modules/comments/comments.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SearchModule } from './modules/search/search.module';
import { ViewsModule } from './modules/views/views.module';
import { WorkItemsModule } from './modules/work-items/work-items.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig] }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RedisModule,
    TenancyModule,
    PortsModule,
    IdempotencyModule,
    HealthModule,
    // M0 bounded contexts (data-model §4): identity + orgs. @Global; expose cross-module ports.
    IdentityModule,
    OrgsModule,
    // M1 bounded contexts (data-model §4).
    ProjectsModule,
    WorkItemsModule,
    CommentsModule,
    ViewsModule,
    SearchModule,
    NotificationsModule,
  ],
  providers: [
    // Guard chain (order matters): authenticate → resolve tenant → authorize → throttle.
    // Each guard is a permissive STUB here; the P1 user stories fill the logic
    // (US2 AuthGuard/Throttle, US4 Rbac, US5 Tenant).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: ThrottleGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Establish tenant context (org → ALS) for every request before guards/handlers.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
