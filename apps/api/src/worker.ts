import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Worker entrypoint — same image as `api`, started with `WORKER=1` (ADR-012).
 * Boots a non-HTTP application context. M0+ registers BullMQ processors here;
 * for the scaffold it simply comes up and stays alive.
 */
export async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
  console.log('RyTask worker context started (BullMQ processors land in M0+).');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep the process alive until a signal arrives (a real worker is kept alive by BullMQ).
  await new Promise<void>(() => {});
}
