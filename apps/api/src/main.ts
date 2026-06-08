import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
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

  // `rawBody: true` keeps the EXACT request bytes alongside the parsed body (Nest's default json +
  // urlencoded parsers are unchanged). The Slack webhook signature guard (M3, research D4) needs the
  // verbatim bytes to recompute the HMAC; every other route still reads the normally-parsed body.
  const app = await NestFactory.create(AppModule, { rawBody: true });
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
  // REST API lives under /api/v1 (§6.1); infra probes stay at the root. The Slack OAuth callback
  // is served at the ROOT too (M3) — Slack redirects a browser there with no /api/v1 knowledge.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      'healthz',
      'readyz',
      { path: 'integrations/slack/oauth/callback', method: RequestMethod.GET },
    ],
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`RyTask API listening on :${port}`);
}

void bootstrap();
