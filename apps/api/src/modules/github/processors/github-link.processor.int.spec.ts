import {
  type DbHandle,
  SEED_ORG_ID,
  SEED_USER_ID,
  SEED_WORKSPACE_ID,
  activity,
  createDb,
  runMigrations,
  seed,
} from '@rytask/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { type StartedPostgres, startPostgres } from '../../../common/testing/postgres';
import { ActivityRepository } from '../../work-items/repositories/activity.repository';
import { WorkItemWatchersRepository } from '../../work-items/repositories/work-item-watchers.repository';
import { WorkItemsRepository } from '../../work-items/repositories/work-items.repository';
import { WorkItemAccessServiceImpl } from '../../work-items/services/work-item-access.service';
import { GithubConnectionsRepository } from '../repositories/github-connections.repository';
import { GithubLinksRepository } from '../repositories/github-links.repository';
import { type GithubLinkJob, GithubLinkProcessor } from './github-link.processor';

/**
 * Integration test against REAL PostgreSQL (M5, AC-11, FR-INT-GH-006/007). Proves the linking
 * worker end-to-end over the seeded items (RY-1..3):
 *   - a push commit "Fixes RY-2 …" → one `github_links` row + one `GITHUB_LINKED` activity on RY-2;
 *   - REPLAYING the same delivery changes nothing (the redelivery guarantee);
 *   - a PR whose body says "Closes RY-3" links kind=PR;
 *   - unknown keys are silently not links; a revoked connection and a mismatched repo are no-ops.
 */
const CTX = { organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, userId: SEED_USER_ID };

/** Seeded items (packages/db/src/seed.ts): RY-1/2/3. */
const RY2 = '0193b3a0-0000-7000-8000-000000000021';
const RY3 = '0193b3a0-0000-7000-8000-000000000022';

describe('GithubLinkProcessor (integration)', () => {
  let pg: StartedPostgres;
  let handle: DbHandle;
  let tenant: TenantContextService;
  let connections: GithubConnectionsRepository;
  let links: GithubLinksRepository;
  let processor: GithubLinkProcessor;
  let connectionId: string;

  const githubActivityFor = (workItemId: string) =>
    handle.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.organizationId, SEED_ORG_ID),
          eq(activity.workItemId, workItemId),
          eq(activity.action, 'GITHUB_LINKED'),
        ),
      );

  beforeAll(async () => {
    pg = await startPostgres();
    await runMigrations(pg.url);
    await seed(pg.url);
    handle = createDb(pg.url);
    tenant = new TenantContextService();
    connections = new GithubConnectionsRepository(handle.db, tenant);
    links = new GithubLinksRepository(handle.db, tenant);
    const access = new WorkItemAccessServiceImpl(
      new WorkItemsRepository(handle.db, tenant),
      new WorkItemWatchersRepository(handle.db, tenant),
      new ActivityRepository(handle.db, tenant),
    );
    processor = new GithubLinkProcessor(connections, links, access, tenant);

    const row = await tenant.run(CTX, () =>
      connections.upsert({
        workspaceId: SEED_WORKSPACE_ID,
        repoFullName: 'acme/web',
        webhookSecretCiphertext: 'c',
        webhookSecretIv: 'i',
        webhookSecretTag: 't',
        createdByUserId: SEED_USER_ID,
      }),
    );
    connectionId = row.id;
  });

  afterAll(async () => {
    await handle?.pool.end();
    await pg?.stop();
  });

  const pushJob = (overrides?: Partial<Extract<GithubLinkJob, { kind: 'push' }>>) =>
    ({
      kind: 'push',
      connectionId,
      deliveryId: 'd-push-1',
      repoFullName: 'acme/web',
      commits: [
        {
          sha: 'abc1234def',
          message: 'Fixes RY-2 — stop the login loop\n\nLonger body.',
          url: 'https://github.com/acme/web/commit/abc1234def',
          authorLogin: 'octocat',
        },
      ],
      ...overrides,
    }) satisfies GithubLinkJob;

  it('links a push commit with "Fixes RY-2" into RY-2 (link row + GITHUB_LINKED activity)', async () => {
    const outcome = await processor.handle(pushJob());
    expect(outcome).toEqual({ status: 'processed', linked: 1 });

    const rows = await tenant.run(CTX, () => links.listForItem(RY2));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'COMMIT',
      externalRef: 'abc1234def',
      url: 'https://github.com/acme/web/commit/abc1234def',
      title: 'Fixes RY-2 — stop the login loop',
      authorLogin: 'octocat',
    });

    const feed = await githubActivityFor(RY2);
    expect(feed).toHaveLength(1);
    expect(feed[0]?.newValue).toMatchObject({
      kind: 'COMMIT',
      ref: 'abc1234def',
      repoFullName: 'acme/web',
    });
  });

  it('REPLAYING the same delivery creates no duplicate link and no duplicate activity', async () => {
    const outcome = await processor.handle(pushJob());
    expect(outcome).toEqual({ status: 'processed', linked: 0 }); // nothing new

    expect(await tenant.run(CTX, () => links.listForItem(RY2))).toHaveLength(1);
    expect(await githubActivityFor(RY2)).toHaveLength(1);
  });

  it('links a PR whose body says "Closes RY-3" (kind PR, ref = PR number)', async () => {
    const job: GithubLinkJob = {
      kind: 'pull_request',
      connectionId,
      deliveryId: 'd-pr-1',
      repoFullName: 'acme/web',
      pr: {
        number: 42,
        title: 'Tidy the inbox flow',
        body: 'Closes RY-3\n\nAlso mentions NOPE-99 which does not exist.',
        url: 'https://github.com/acme/web/pull/42',
        authorLogin: 'octocat',
      },
    };
    const outcome = await processor.handle(job);
    expect(outcome).toEqual({ status: 'processed', linked: 1 }); // NOPE-99 silently ignored

    const rows = await tenant.run(CTX, () => links.listForItem(RY3));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'PR', externalRef: '42', title: 'Tidy the inbox flow' });
    expect(await githubActivityFor(RY3)).toHaveLength(1);
  });

  it('skips a delivery whose repo does not match the connection (defense-in-depth)', async () => {
    const outcome = await processor.handle(
      pushJob({ deliveryId: 'd-push-2', repoFullName: 'evil/fork' }),
    );
    expect(outcome).toEqual({ status: 'skipped', reason: 'repo_mismatch' });
  });

  it('processes nothing after disconnect (no orphaned writes)', async () => {
    await tenant.run(CTX, () => connections.revoke(connectionId));
    const outcome = await processor.handle(pushJob({ deliveryId: 'd-push-3' }));
    expect(outcome).toEqual({ status: 'skipped', reason: 'disconnected' });

    expect(await tenant.run(CTX, () => links.listForItem(RY2))).toHaveLength(1); // unchanged
  });
});
