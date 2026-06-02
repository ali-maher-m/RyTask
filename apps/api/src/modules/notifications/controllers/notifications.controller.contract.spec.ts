import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  Notification,
  NotificationEnvelope,
  NotificationListResponse,
  UnreadCountResponse,
} from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { withPrincipal } from '../../../common/testing/with-principal';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { NotificationsService } from '../services/notifications.service';

/**
 * Contract test for the notifications routes (T106). The service is mocked, so this
 * asserts the HTTP contract — `GET /notifications`, `GET /notifications/unread-count`,
 * `PATCH /notifications/{id}`, the envelopes, and `.strict()` Zod validation. DB
 * behaviour (dedupe, snooze, archive) is covered by the integration tests.
 */
const NOTIF_ID = '0193b3a0-0000-7000-8000-0000000000e1';
const cannedNotification: Notification = {
  id: NOTIF_ID,
  recipientId: SEED_USER_ID,
  type: 'COMMENTED',
  entityType: 'work_item',
  entityId: '0193b3a0-0000-7000-8000-000000000020',
  actorId: null,
  payload: { key: 'RY-1' },
  readAt: null,
  snoozedUntil: null,
  archivedAt: null,
  createdAt: '2026-05-31T12:00:00.000Z',
};

const mockService = {
  list: vi.fn(
    async (): Promise<NotificationListResponse> => ({
      data: [cannedNotification],
      pageInfo: { nextCursor: null, hasNextPage: false },
    }),
  ),
  unreadCount: vi.fn(async (): Promise<UnreadCountResponse> => ({ data: { count: 3 } })),
  update: vi.fn(
    async (_id: string, body: { read?: boolean }): Promise<NotificationEnvelope> => ({
      data: { ...cannedNotification, readAt: body.read ? '2026-05-31T13:00:00.000Z' : null },
    }),
  ),
};

describe('NotificationsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationsService)
      .useValue(mockService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'get' | 'patch', path: string): request.Test =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('authorization', withPrincipal({ userId: SEED_USER_ID, organizationId: SEED_ORG_ID, workspaceId: SEED_WORKSPACE_ID, role: 'OWNER' }));

  it('GET /notifications → 200 { data, pageInfo }', async () => {
    const res = await authed('get', '/notifications').send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pageInfo).toMatchObject({ nextCursor: null, hasNextPage: false });
  });

  it('GET /notifications?state=archived → 200', async () => {
    const res = await authed('get', '/notifications?state=archived').send();
    expect(res.status).toBe(200);
  });

  it('GET /notifications with an invalid state → 400 (strict enum)', async () => {
    const res = await authed('get', '/notifications?state=bogus').send();
    expect(res.status).toBe(400);
  });

  it('GET /notifications with an unknown query field → 400 (strict)', async () => {
    const res = await authed('get', '/notifications?bogus=1').send();
    expect(res.status).toBe(400);
  });

  it('GET /notifications/unread-count → 200 { data: { count } }', async () => {
    const res = await authed('get', '/notifications/unread-count').send();
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it('PATCH /notifications/{id} read=true → 200 { data }', async () => {
    const res = await authed('patch', `/notifications/${NOTIF_ID}`).send({ read: true });
    expect(res.status).toBe(200);
    expect(res.body.data.readAt).not.toBeNull();
  });

  it('PATCH /notifications/{id} snoozedUntil → 200', async () => {
    const res = await authed('patch', `/notifications/${NOTIF_ID}`).send({
      snoozedUntil: '2026-06-01T09:00:00.000Z',
    });
    expect(res.status).toBe(200);
  });

  it('PATCH /notifications/{id} with an empty body → 400', async () => {
    const res = await authed('patch', `/notifications/${NOTIF_ID}`).send({});
    expect(res.status).toBe(400);
  });

  it('PATCH /notifications/{id} with an unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/notifications/${NOTIF_ID}`).send({ bogus: true });
    expect(res.status).toBe(400);
  });
});
