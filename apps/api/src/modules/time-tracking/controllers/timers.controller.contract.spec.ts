import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ActiveTimer, TimeLog } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { GetActiveTimerProvider } from '../providers/get-active-timer.provider';
import { StartTimerProvider } from '../providers/start-timer.provider';
import { StopTimerProvider } from '../providers/stop-timer.provider';

/**
 * Contract test for the timer routes (T018, contracts/time-rest.md §Timer routes). Providers are
 * mocked, so this asserts the HTTP contract — 201/200 envelopes, `.strict()` Zod validation on the
 * start body, and that a provider `NotFoundException` surfaces as 404. DB behaviour + the
 * one-active-timer logic are covered by the integration tests.
 */
const ITEM_ID = '0193b3a0-0000-7000-8000-000000000020';
const MISSING_ID = '0193b3a0-0000-7000-8000-0000000000ee';
const TIMER_ID = '0193b3a0-0000-7000-8000-000000000040';

const cannedTimer: ActiveTimer = {
  id: TIMER_ID,
  workItemId: ITEM_ID,
  startedAt: '2026-06-09T12:00:00.000Z',
  note: null,
};
const cannedLog: TimeLog = {
  id: '0193b3a0-0000-7000-8000-000000000050',
  workItemId: ITEM_ID,
  projectId: '0193b3a0-0000-7000-8000-000000000010',
  userId: SEED_USER_ID,
  startedAt: '2026-06-09T12:00:00.000Z',
  endedAt: '2026-06-09T12:30:00.000Z',
  durationSeconds: 1800,
  note: null,
  billable: false,
  source: 'TIMER',
  classification: 'PLANNED',
  classificationOverridden: false,
  createdAt: '2026-06-09T12:30:00.000Z',
  updatedAt: '2026-06-09T12:30:00.000Z',
};

const mockStart = {
  start: vi.fn(async (workItemId: string): Promise<ActiveTimer> => {
    if (workItemId === MISSING_ID) throw new NotFoundException('work item not found');
    return cannedTimer;
  }),
};
const mockStop = { stop: vi.fn(async (): Promise<TimeLog> => cannedLog) };
const mockActive = { getActive: vi.fn(async (): Promise<ActiveTimer | null> => cannedTimer) };

describe('TimersController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StartTimerProvider)
      .useValue(mockStart)
      .overrideProvider(StopTimerProvider)
      .useValue(mockStop)
      .overrideProvider(GetActiveTimerProvider)
      .useValue(mockActive)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'post' | 'get', path: string): request.Test =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set(
        'authorization',
        withPrincipal({
          userId: SEED_USER_ID,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          role: 'OWNER',
        }),
      );

  it('POST /work-items/{id}/timer/start (empty body) → 201 { data: ActiveTimer }', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/timer/start`).send({});
    expect(res.status).toBe(201);
    expect(res.body.data.workItemId).toBe(ITEM_ID);
    expect(res.body.data.startedAt).toBe('2026-06-09T12:00:00.000Z');
  });

  it('POST /work-items/{id}/timer/start with a note → 201', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/timer/start`).send({ note: 'focus' });
    expect(res.status).toBe(201);
  });

  it('POST /work-items/{id}/timer/start unknown field → 400 (strict schema)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/timer/start`).send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it('POST /work-items/{id}/timer/start on a missing item → 404', async () => {
    const res = await authed('post', `/work-items/${MISSING_ID}/timer/start`).send({});
    expect(res.status).toBe(404);
  });

  it('POST /timers/{id}/stop → 201 { data: TimeLog }', async () => {
    const res = await authed('post', `/timers/${TIMER_ID}/stop`).send();
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe('TIMER');
    expect(res.body.data.durationSeconds).toBe(1800);
  });

  it('GET /timers/active → 200 { data: ActiveTimer }', async () => {
    const res = await authed('get', '/timers/active').send();
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(TIMER_ID);
  });

  it('GET /timers/active → 200 { data: null } when idle', async () => {
    mockActive.getActive.mockResolvedValueOnce(null);
    const res = await authed('get', '/timers/active').send();
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});
