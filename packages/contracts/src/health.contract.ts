import { z } from 'zod';

/** Liveness — process is up. No external dependencies checked. */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** Readiness — process can serve traffic (DB + Redis reachable). */
export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down']),
    redis: z.enum(['up', 'down']),
  }),
});
export type Readiness = z.infer<typeof readinessSchema>;
