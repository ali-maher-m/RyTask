import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { securityHeaders } from './common/config/security';
import { bootstrapWorker } from './worker';

/**
 * Single entrypoint for both `api` and `worker` (ARCHITECTURE §2.2, ADR-012).
 * Same codebase / same Docker image; `WORKER=1` boots background processing instead
 * of the HTTP server.
 */
async function bootstrap(): Promise<void> {
  if (process.env.WORKER) {
    await bootstrapWorker();
    return;
  }

  const app = await NestFactory.create(AppModule);
  // Production transport security: HSTS/TLS-only + nosniff (NFR-SEC-001, SC-015). Auth is
  // cookieless (bearer tokens), so there is no session cookie to secure.
  app.use(securityHeaders(process.env.NODE_ENV === 'production'));
  // The web app is served from a different origin (compose: web :3000 → api :3001), so
  // cross-origin requests must be allowed. The browser sends a Bearer token in the
  // `Authorization` header (the M1 dev-header seam is gone — M0/US2). `CORS_ORIGIN`
  // (comma-separated) narrows it for production; the default reflects the request origin
  // for the self-hosted single-tenant case.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
  app.enableCors({ origin: corsOrigin && corsOrigin.length > 0 ? corsOrigin : true });
  // REST API lives under /api/v1 (§6.1); infra probes stay at the root.
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`RyTask API listening on :${port}`);
}

void bootstrap();
