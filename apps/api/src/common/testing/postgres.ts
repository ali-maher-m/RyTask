import { PostgreSqlContainer } from '@testcontainers/postgresql';

export interface StartedPostgres {
  /** `postgres://...` connection string for the started container. */
  url: string;
  /** Stops and removes the container. */
  stop: () => Promise<void>;
}

/**
 * Starts a disposable PostgreSQL 16 container for integration tests (§14.1 —
 * real Postgres, not mocks). Requires a running Docker daemon. Call in `beforeAll`,
 * `stop()` in `afterAll`.
 */
export async function startPostgres(image = 'postgres:16'): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer(image).start();
  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
