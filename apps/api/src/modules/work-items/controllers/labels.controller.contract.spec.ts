import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Label } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { LabelsService } from '../services/labels.service';

/**
 * Contract test for GET|POST /labels (T034). The service is mocked, so this asserts the
 * HTTP contract — the `{ data }` envelope, 201 on create, and `.strict()` Zod validation
 * (unknown field / missing name → 400). DB behaviour + tenancy are covered elsewhere.
 */
const cannedLabel: Label = {
  id: '0193b3a0-0000-7000-8000-0000000000aa',
  name: 'bug',
  color: '#EF4444',
};
const mockService = {
  list: vi.fn(async () => ({ data: [cannedLabel] })),
  create: vi.fn(async (): Promise<{ data: Label }> => ({ data: cannedLabel })),
};

describe('LabelsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LabelsService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'get' | 'post'): request.Test =>
    request(app.getHttpServer())
      [method]('/api/v1/labels')
      .set('x-user-id', SEED_USER_ID)
      .set('x-organization-id', SEED_ORG_ID)
      .set('x-workspace-id', SEED_WORKSPACE_ID);

  it('GET /labels → 200 { data: [...] }', async () => {
    const res = await authed('get').send();
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('bug');
  });

  it('POST /labels → 201 { data }', async () => {
    const res = await authed('post').send({ name: 'bug', color: '#EF4444' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(cannedLabel.id);
  });

  it('POST /labels missing name → 400', async () => {
    const res = await authed('post').send({ color: '#EF4444' });
    expect(res.status).toBe(400);
  });

  it('POST /labels unknown field → 400 (strict)', async () => {
    const res = await authed('post').send({ name: 'bug', bogus: true });
    expect(res.status).toBe(400);
  });
});
