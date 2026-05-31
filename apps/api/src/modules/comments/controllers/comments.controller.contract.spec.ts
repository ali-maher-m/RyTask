import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Comment, CommentEnvelope, CommentListResponse } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { CommentsService } from '../services/comments.service';

/**
 * Contract test for the comments routes (T106). The service is mocked, so this asserts
 * the HTTP contract — `GET|POST /work-items/{id}/comments`, the `{ data }` / `{ data,
 * pageInfo }` envelopes, and `.strict()` Zod validation. DB behaviour + RBAC + mentions
 * are covered by the integration test.
 */
const ITEM_ID = '0193b3a0-0000-7000-8000-000000000020';
const cannedComment: Comment = {
  id: '0193b3a0-0000-7000-8000-0000000000d1',
  workItemId: ITEM_ID,
  authorId: SEED_USER_ID,
  parentId: null,
  body: 'Looks good @founder',
  mentions: [SEED_USER_ID],
  createdAt: '2026-05-31T12:00:00.000Z',
  updatedAt: '2026-05-31T12:00:00.000Z',
  editedAt: null,
};

const mockService = {
  list: vi.fn(
    async (): Promise<CommentListResponse> => ({
      data: [cannedComment],
      pageInfo: { nextCursor: null, hasNextPage: false },
    }),
  ),
  create: vi.fn(async (): Promise<CommentEnvelope> => ({ data: cannedComment })),
};

describe('CommentsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CommentsService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'get' | 'post', path: string): request.Test =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('x-user-id', SEED_USER_ID)
      .set('x-organization-id', SEED_ORG_ID)
      .set('x-workspace-id', SEED_WORKSPACE_ID);

  it('GET /work-items/{id}/comments → 200 { data, pageInfo }', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}/comments`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].body).toBe('Looks good @founder');
    expect(res.body.pageInfo).toMatchObject({ nextCursor: null, hasNextPage: false });
  });

  it('POST /work-items/{id}/comments (body) → 201 { data }', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/comments`).send({
      body: 'Looks good @founder',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(cannedComment.id);
  });

  it('POST a threaded reply (parentId) → 201', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/comments`).send({
      body: 'reply',
      parentId: '0193b3a0-0000-7000-8000-0000000000d2',
    });
    expect(res.status).toBe(201);
  });

  it('POST with an empty body → 400', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/comments`).send({ body: '' });
    expect(res.status).toBe(400);
  });

  it('POST with a missing body → 400', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/comments`).send({});
    expect(res.status).toBe(400);
  });

  it('POST with an unknown field → 400 (strict)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/comments`).send({
      body: 'x',
      workItemId: ITEM_ID,
    });
    expect(res.status).toBe(400);
  });
});
