import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { authConfig } from './common/config/auth.config';
import { integrationsConfig } from './common/config/integrations.config';
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
import { McpModule } from './mcp/mcp.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ExportModule } from './modules/export/export.module';
import { GithubModule } from './modules/github/github.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { SearchModule } from './modules/search/search.module';
import { SlackModule } from './modules/slack/slack.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { ViewsModule } from './modules/views/views.module';
import { WorkItemsModule } from './modules/work-items/work-items.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [authConfig, integrationsConfig] }),
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
    // M3 — Slack capture channel (bounded module) + MCP transport edge (not a domain module).
    SlackModule,
    McpModule,
    // M2 — time tracking (the flagship): live timer, manual entries, plan-vs-actual meter.
    TimeTrackingModule,
    // M5 — lightweight GitHub magic-word linking + full workspace export ("code + safe exit").
    GithubModule,
    ExportModule,
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
