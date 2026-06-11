import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role, WorkspaceExportDto } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { WorkspaceExportProvider } from '../providers/workspace-export.provider';

/**
 * Contract test for the export surface (M5, AC-12, FR-PORT-004). The provider is mocked, so this
 * asserts the HTTP contract + the live RbacGuard: a whole-tenant archive is OWNER/ADMIN-only
 * (`@Roles` — MEMBER/GUEST/VIEWER 403, unauthenticated 401); JSON downloads as an attachment;
 * the two CSV entities render `text/csv`; bad `format`/`entity` → 400.
 */
const archive: WorkspaceExportDto = {
  format: 'rytask.workspace-export',
  version: 1,
  exportedAt: '2026-06-11T12:00:00.000Z',
  organization: {
    id: SEED_ORG_ID,
    name: 'Acme',
    slug: 'acme',
    settings: {},
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  workspaces: [],
  members: [],
  projects: [],
  statuses: [],
  labels: [],
  workItems: [
    {
      id: 'i1',
      projectId: 'p1',
      key: 'RY-7',
      number: 7,
      title: 'One exported item',
      description: null,
      statusId: 's1',
      priority: 'MEDIUM',
      source: 'WEB',
      assigneeId: null,
      reporterId: null,
      parentId: null,
      labelIds: [],
      estimateValue: null,
      startDate: null,
      endDate: null,
      dueDate: null,
      completedAt: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-06-10T00:00:00.000Z',
      deletedAt: null,
    },
  ],
  comments: [],
  timeLogs: [
    {
      id: 't1',
      projectId: 'p1',
      workItemId: 'i1',
      userId: 'u1',
      startedAt: '2026-06-10T09:00:00.000Z',
      endedAt: '2026-06-10T10:00:00.000Z',
      durationSeconds: 3600,
      note: null,
      billable: false,
      source: 'TIMER',
      classification: 'PLANNED',
      classificationOverridden: false,
      createdAt: '2026-06-10T10:00:00.000Z',
      deletedAt: null,
    },
  ],
  counts: {
    workspaces: 0,
    members: 0,
    projects: 0,
    statuses: 0,
    labels: 0,
    workItems: 1,
    comments: 0,
    timeLogs: 1,
  },
};

const tokenFor = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

describe('Export (contract)', () => {
  let app: INestApplication;
  const exportFn = vi.fn(async () => archive);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WorkspaceExportProvider)
      .useValue({ export: exportFn })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  it('GET /export/workspace returns the JSON archive as a dated attachment (OWNER 200)', async () => {
    const res = await request(server())
      .get('/api/v1/export/workspace')
      .set('authorization', tokenFor('OWNER'));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="rytask-export-2026-06-11.json"',
    );
    expect(res.body.format).toBe('rytask.workspace-export');
    expect(res.body.counts.workItems).toBe(1);
  });

  it('ADMIN may export too (200)', async () => {
    const res = await request(server())
      .get('/api/v1/export/workspace')
      .set('authorization', tokenFor('ADMIN'));
    expect(res.status).toBe(200);
  });

  it('MEMBER, GUEST and VIEWER are denied (403) — an archive is more than work:read', async () => {
    for (const role of ['MEMBER', 'GUEST', 'VIEWER'] as const) {
      const res = await request(server())
        .get('/api/v1/export/workspace')
        .set('authorization', tokenFor(role));
      expect(res.status).toBe(403);
    }
  });

  it('rejects the unauthenticated (401)', async () => {
    expect((await request(server()).get('/api/v1/export/workspace')).status).toBe(401);
  });

  it('serves work items as CSV (text/csv, one row per item)', async () => {
    const res = await request(server())
      .get('/api/v1/export/workspace?format=csv&entity=work-items')
      .set('authorization', tokenFor('OWNER'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('rytask-work-items-2026-06-11.csv');
    const text = res.text;
    expect(text.startsWith('key,title,')).toBe(true);
    expect(text).toContain('RY-7');
  });

  it('serves time logs as CSV', async () => {
    const res = await request(server())
      .get('/api/v1/export/workspace?format=csv&entity=time-logs')
      .set('authorization', tokenFor('OWNER'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('3600');
  });

  it('400s on a bad format or unknown csv entity', async () => {
    const badFormat = await request(server())
      .get('/api/v1/export/workspace?format=xml')
      .set('authorization', tokenFor('OWNER'));
    expect(badFormat.status).toBe(400);

    const badEntity = await request(server())
      .get('/api/v1/export/workspace?format=csv&entity=secrets')
      .set('authorization', tokenFor('OWNER'));
    expect(badEntity.status).toBe(400);
  });
});
