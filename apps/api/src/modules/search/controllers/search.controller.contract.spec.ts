import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SearchEnvelope, SearchResult } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { SearchService } from '../services/search.service';

/**
 * Contract test for `GET /search` (T117). The service is mocked, so this asserts the HTTP
 * contract — the `{ data }` envelope, the permission-scoped `SearchResult` payload shape,
 * `authenticated` RBAC (any signed-in principal), and `.strict()` Zod query validation.
 * Tenant + permission scoping + ranking are covered by the integration test (T116).
 */
const cannedResults: SearchResult[] = [
  {
    type: 'work_item',
    id: '0193b3a0-0000-7000-8000-0000000000e1',
    title: 'Capture work in seconds',
    snippet: 'A quick-add line creates an item.',
    rank: 0.8,
    projectId: '0193b3a0-0000-7000-8000-000000000010',
  },
  {
    type: 'project',
    id: '0193b3a0-0000-7000-8000-000000000010',
    title: 'RyTask Demo',
    snippet: null,
    rank: 0,
    projectId: '0193b3a0-0000-7000-8000-000000000010',
  },
];

const mockService = {
  search: vi.fn(async (): Promise<SearchEnvelope> => ({ data: cannedResults })),
};

describe('SearchController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SearchService)
      .useValue(mockService)
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

  it('GET /search?q=… → 200 { data: SearchResult[] }', async () => {
    const res = await authed('/search?q=capture').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const first = res.body.data[0];
    expect(first).toMatchObject({
      type: 'work_item',
      id: cannedResults[0]?.id,
      title: 'Capture work in seconds',
      rank: 0.8,
      projectId: cannedResults[0]?.projectId,
    });
    // `snippet`/`projectId` are explicitly nullable in the contract.
    expect(res.body.data[1]).toMatchObject({ type: 'project', snippet: null });
  });

  it('passes q, types, and limit through to the service', async () => {
    mockService.search.mockClear();
    const res = await authed('/search?q=board&types=work_item,project&limit=10').send();
    expect(res.status).toBe(200);
    expect(mockService.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'board', types: 'work_item,project', limit: 10 }),
    );
  });

  it('defaults limit to 20 when omitted', async () => {
    mockService.search.mockClear();
    await authed('/search?q=anything').send();
    expect(mockService.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it('GET /search with no q → 400', async () => {
    const res = await authed('/search').send();
    expect(res.status).toBe(400);
  });

  it('GET /search with an empty q → 400', async () => {
    const res = await authed('/search?q=').send();
    expect(res.status).toBe(400);
  });

  it('GET /search with an unknown query param → 400 (strict)', async () => {
    const res = await authed('/search?q=x&bogus=1').send();
    expect(res.status).toBe(400);
  });
});
