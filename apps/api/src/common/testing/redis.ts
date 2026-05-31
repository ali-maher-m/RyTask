import { GenericContainer, type StartedTestContainer } from 'testcontainers';

export interface StartedRedis {
  /** `redis://host:port` connection string for the started container. */
  url: string;
  /** Stops and removes the container. */
  stop: () => Promise<void>;
}

/**
 * Starts a disposable Redis 7 container for processor integration tests (§14.1 —
 * real infrastructure, not mocks). Requires a running Docker daemon. Mirrors
 * `common/testing/postgres.ts`. Call in `beforeAll`, `stop()` in `afterAll`.
 */
export async function startRedis(image = 'redis:7'): Promise<StartedRedis> {
  const container: StartedTestContainer = await new GenericContainer(image)
    .withExposedPorts(6379)
    .start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  return {
    url,
    stop: async () => {
      await container.stop();
    },
  };
}
