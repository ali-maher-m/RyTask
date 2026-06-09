import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ItemRollup, TimeSummaryRow } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { TimeRollupProvider } from '../providers/time-rollup.provider';
import { TimeSummaryProvider } from '../providers/time-summary.provider';

/**
 * Contract test for the aggregation routes (T031/T073, contracts/time-rest.md §Aggregation). Both
 * providers are mocked, so this asserts the HTTP contracts: `GET /time/rollup` → 200
 * `{ data: ItemRollup[] }` and `GET /time/summary` → 200 `{ data: TimeSummaryRow[] }`, each with
 * `.strict()` query validation (bad/unknown params → 400).
 */
const rollup: ItemRollup[] = [
  { workItemId: '0193b3a0-0000-7000-8000-000000000020', loggedSeconds: 11700 },
  { workItemId: '0193b3a0-0000-7000-8000-000000000021', loggedSeconds: 9000 },
];
const summary: TimeSummaryRow[] = [
  { key: '2026-06-09', loggedSeconds: 11700, plannedSeconds: 11700, interruptionSeconds: 0 },
  { key: '2026-06-08', loggedSeconds: 5400, plannedSeconds: 0, interruptionSeconds: 5400 },
];
const mockRollup = { getProjectRollup: vi.fn(async (): Promise<ItemRollup[]> => rollup) };
const mockSummary = { getSummary: vi.fn(async (): Promise<TimeSummaryRow[]> => summary) };

describe('TimeSummaryController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TimeRollupProvider)
      .useValue(mockRollup)
      .overrideProvider(TimeSummaryProvider)
      .useValue(mockSummary)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (path: string): request.Test =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set(
        'authorization',
        withPrincipal({
          userId: SEED_USER_ID,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          role: 'OWNER',
        }),
      );

  it('GET /time/rollup?projectId= → 200 { data: ItemRollup[] }', async () => {
    const res = await authed(`/time/rollup?projectId=${SEED_PROJECT_ID}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({ loggedSeconds: 11700 });
  });

  it('GET /time/rollup without projectId → 400 (strict schema)', async () => {
    const res = await authed('/time/rollup').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/rollup with a non-uuid projectId → 400', async () => {
    const res = await authed('/time/rollup?projectId=not-a-uuid').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/rollup with an unknown query field → 400 (strict)', async () => {
    const res = await authed(`/time/rollup?projectId=${SEED_PROJECT_ID}&bogus=1`).send();
    expect(res.status).toBe(400);
  });

  it('GET /time/summary?groupBy=period&period=day → 200 { data: TimeSummaryRow[] }', async () => {
    const res = await authed('/time/summary?groupBy=period&period=day').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toMatchObject({
      key: '2026-06-09',
      loggedSeconds: 11700,
      plannedSeconds: 11700,
      interruptionSeconds: 0,
    });
  });

  it('GET /time/summary?groupBy=user&userId= (the "my time" query) → 200', async () => {
    const res = await authed(`/time/summary?groupBy=user&userId=${SEED_USER_ID}`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /time/summary without groupBy → 400 (strict schema)', async () => {
    const res = await authed('/time/summary').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/summary with an invalid groupBy → 400', async () => {
    const res = await authed('/time/summary?groupBy=nonsense').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/summary with an invalid period → 400', async () => {
    const res = await authed('/time/summary?groupBy=period&period=month').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/summary with an unknown query field → 400 (strict)', async () => {
    const res = await authed('/time/summary?groupBy=period&bogus=1').send();
    expect(res.status).toBe(400);
  });
});
