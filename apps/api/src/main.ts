import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
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
  // REST API lives under /api/v1 (§6.1); infra probes stay at the root.
  app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`RyTask API listening on :${port}`);
}

void bootstrap();
