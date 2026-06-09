import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  CreateTimeLogInput,
  TimeLog,
  TimeLogListResponse,
  UpdateTimeLogInput,
} from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { CreateTimeLogProvider } from '../providers/create-time-log.provider';
import { DeleteTimeLogProvider } from '../providers/delete-time-log.provider';
import { ListTimeLogsProvider } from '../providers/list-time-logs.provider';
import { UpdateTimeLogProvider } from '../providers/update-time-log.provider';

/**
 * Contract test for the time-log routes (T043/T053, contracts/time-rest.md §Time-log routes). Providers
 * are mocked, so this asserts the HTTP contract — the 201 create envelope, `.strict()` Zod validation,
 * the 400 a provider raises on an invalid duration form, the paginated list envelope, the 200 edit / 204
 * delete, and the non-owner non-admin 403 default-deny (US4). DB behaviour + the duration/permission
 * policies are covered by the integration tests.
 */
const ITEM_ID = '0193b3a0-0000-7000-8000-000000000020';
const LOG_ID = '0193b3a0-0000-7000-8000-000000000050';
const OTHERS_LOG_ID = '0193b3a0-0000-7000-8000-0000000000aa';

const cannedLog: TimeLog = {
  id: '0193b3a0-0000-7000-8000-000000000050',
  workItemId: ITEM_ID,
  projectId: SEED_PROJECT_ID,
  userId: SEED_USER_ID,
  startedAt: '2026-06-08T00:00:00.000Z',
  endedAt: '2026-06-08T02:00:00.000Z',
  durationSeconds: 7200,
  note: 'pairing',
  billable: false,
  source: 'MANUAL',
  classification: 'PLANNED',
  classificationOverridden: false,
  createdAt: '2026-06-09T12:00:00.000Z',
  updatedAt: '2026-06-09T12:00:00.000Z',
};

const mockCreate = {
  // Neither a duration nor a start/end pair → the provider rejects with a 400 (duration.policy).
  create: vi.fn(async (_id: string, input: CreateTimeLogInput): Promise<TimeLog> => {
    const hasForm =
      input.durationSeconds !== undefined ||
      (input.startedAt !== undefined && input.endedAt !== undefined);
    if (!hasForm)
      throw new BadRequestException('Enter either a duration, or both a start and end time.');
    return cannedLog;
  }),
};
const list: TimeLogListResponse = {
  data: [cannedLog],
  pageInfo: { nextCursor: null, hasNextPage: false },
};
const mockList = { list: vi.fn(async (): Promise<TimeLogListResponse> => list) };

// Editing/deleting another user's entry (OTHERS_LOG_ID) is denied default-deny; ours succeeds.
const mockUpdate = {
  update: vi.fn(async (id: string, input: UpdateTimeLogInput): Promise<TimeLog> => {
    if (id === OTHERS_LOG_ID)
      throw new ForbiddenException('you can only edit your own time entries');
    return { ...cannedLog, ...input, id, note: input.note ?? cannedLog.note };
  }),
};
const mockDelete = {
  delete: vi.fn(async (id: string): Promise<void> => {
    if (id === OTHERS_LOG_ID)
      throw new ForbiddenException('you can only delete your own time entries');
  }),
};

describe('TimeLogsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CreateTimeLogProvider)
      .useValue(mockCreate)
      .overrideProvider(ListTimeLogsProvider)
      .useValue(mockList)
      .overrideProvider(UpdateTimeLogProvider)
      .useValue(mockUpdate)
      .overrideProvider(DeleteTimeLogProvider)
      .useValue(mockDelete)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (method: 'post' | 'get' | 'patch' | 'delete', path: string): request.Test =>
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

  it('POST /work-items/{id}/time-logs (duration-only) → 201 { data: TimeLog } source MANUAL', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/time-logs`).send({
      durationSeconds: 7200,
      note: 'pairing',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.source).toBe('MANUAL');
    expect(res.body.data.durationSeconds).toBe(7200);
  });

  it('POST /work-items/{id}/time-logs (start/end) → 201', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/time-logs`).send({
      startedAt: '2026-06-08T00:00:00.000Z',
      endedAt: '2026-06-08T02:00:00.000Z',
    });
    expect(res.status).toBe(201);
  });

  it('POST /work-items/{id}/time-logs with an unknown field → 400 (strict schema)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/time-logs`).send({ bogus: true });
    expect(res.status).toBe(400);
  });

  it('POST /work-items/{id}/time-logs with neither form → 400 (invalid duration)', async () => {
    const res = await authed('post', `/work-items/${ITEM_ID}/time-logs`).send({ note: 'no time' });
    expect(res.status).toBe(400);
  });

  it('GET /work-items/{id}/time-logs → 200 { data, pageInfo }', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}/time-logs`).send();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].source).toBe('MANUAL');
    expect(res.body.pageInfo).toMatchObject({ hasNextPage: false });
  });

  it('GET /work-items/{id}/time-logs?limit=abc → 400 (strict query)', async () => {
    const res = await authed('get', `/work-items/${ITEM_ID}/time-logs?limit=abc`).send();
    expect(res.status).toBe(400);
  });

  it('PATCH /time-logs/{id} → 200 { data: TimeLog }', async () => {
    const res = await authed('patch', `/time-logs/${LOG_ID}`).send({ note: 'corrected' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(LOG_ID);
    expect(res.body.data.note).toBe('corrected');
  });

  it('PATCH /time-logs/{id} with an unknown field → 400 (strict)', async () => {
    const res = await authed('patch', `/time-logs/${LOG_ID}`).send({ bogus: 1 });
    expect(res.status).toBe(400);
  });

  it('PATCH /time-logs/{id} on another user’s entry (non-owner, non-admin) → 403', async () => {
    const res = await authed('patch', `/time-logs/${OTHERS_LOG_ID}`).send({ note: 'nope' });
    expect(res.status).toBe(403);
  });

  it('DELETE /time-logs/{id} → 204', async () => {
    const res = await authed('delete', `/time-logs/${LOG_ID}`).send();
    expect(res.status).toBe(204);
  });

  it('DELETE /time-logs/{id} on another user’s entry → 403', async () => {
    const res = await authed('delete', `/time-logs/${OTHERS_LOG_ID}`).send();
    expect(res.status).toBe(403);
  });
});
