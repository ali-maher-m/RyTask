import { BadRequestException, ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  InterruptionLedger,
  ReportOverview,
  ReportRangeQuery,
  ReportWeekQuery,
  WeeklySummary,
} from '@rytask/contracts';
import { SEED_ORG_ID, SEED_PROJECT_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../../app.module';
import { withPrincipal } from '../../../common/testing/with-principal';
import { validateRange, validateWeekStart } from '../domain/report-range.policy';
import { InterruptionLedgerProvider } from '../providers/interruption-ledger.provider';
import { ReportOverviewProvider } from '../providers/report-overview.provider';
import { WeeklySummaryProvider } from '../providers/weekly-summary.provider';

/**
 * Contract test for the M4 reporting routes (contracts/reports-rest.md). Providers are mocked, so
 * this asserts the HTTP contracts: the `{ data: T }` envelope, `.strict()` zod query validation
 * (bad/unknown params → 400), the range-policy 400s (`from > to`, span > 366d — the mock delegates to
 * the real `report-range.policy`, exactly as the provider does), 401 with no principal, 403 when a
 * `projectId` lacks VIEWER (the mock throws `ForbiddenException`), and `work:read` enforcement
 * (scope ∩ role). US2/US3 extend this file in place with the interruptions + week routes.
 */
const FORBIDDEN_PROJECT = '0193b3a0-0000-7000-8000-0000000000f9';

const overview: ReportOverview = {
  range: { from: '2026-06-01', to: '2026-06-14' },
  totals: { loggedSeconds: 13200, plannedSeconds: 11400, interruptionSeconds: 1800 },
  weeks: [
    { weekStart: '2026-06-01', loggedSeconds: 5400, plannedSeconds: 3600, interruptionSeconds: 1800 },
    { weekStart: '2026-06-08', loggedSeconds: 7800, plannedSeconds: 7800, interruptionSeconds: 0 },
  ],
  topItems: [
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000020',
      projectId: SEED_PROJECT_ID,
      key: 'RY-1',
      title: 'Ship the report',
      loggedSeconds: 10800,
    },
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000021',
      projectId: SEED_PROJECT_ID,
      key: 'RY-2',
      title: 'Triage the outage',
      loggedSeconds: 2400,
    },
  ],
};

const mockOverview = {
  getOverview: vi.fn(async (q: ReportRangeQuery): Promise<ReportOverview> => {
    const r = validateRange(q.from, q.to);
    if (!r.ok) throw new BadRequestException(r.message);
    if (q.projectId === FORBIDDEN_PROJECT) throw new ForbiddenException('forbidden project');
    return overview;
  }),
};

const ledger: InterruptionLedger = {
  range: { from: '2026-06-01', to: '2026-06-14' },
  totalSeconds: 5400,
  itemCount: 2,
  entryCount: 3,
  items: [
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000021',
      projectId: SEED_PROJECT_ID,
      key: 'RY-2',
      title: 'Triage the outage',
      captureSource: 'SLACK',
      reporter: { id: SEED_USER_ID, name: 'Founder' },
      entryCount: 2,
      seconds: 3600,
    },
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000022',
      projectId: SEED_PROJECT_ID,
      key: 'RY-3',
      title: 'Pager went off',
      captureSource: 'WEB',
      reporter: null, // the reporter was removed → "(removed user)"
      entryCount: 1,
      seconds: 1800,
    },
  ],
  weeks: [
    { weekStart: '2026-06-01', seconds: 1800, itemCount: 1 },
    { weekStart: '2026-06-08', seconds: 3600, itemCount: 1 },
  ],
};

const mockLedger = {
  getLedger: vi.fn(async (q: ReportRangeQuery): Promise<InterruptionLedger> => {
    const r = validateRange(q.from, q.to);
    if (!r.ok) throw new BadRequestException(r.message);
    if (q.projectId === FORBIDDEN_PROJECT) throw new ForbiddenException('forbidden project');
    return ledger;
  }),
};

const weekly: WeeklySummary = {
  weekStart: '2026-06-08',
  weekEnd: '2026-06-14',
  userId: SEED_USER_ID,
  totals: { loggedSeconds: 9000, plannedSeconds: 7200, interruptionSeconds: 1800 },
  items: [
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000020',
      projectId: SEED_PROJECT_ID,
      key: 'RY-1',
      title: 'Ship the report',
      loggedSeconds: 7200,
      estimateValue: '8', // raw M1 numeric-as-string (hours interpretation is a client concern)
      completed: true,
    },
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000021',
      projectId: SEED_PROJECT_ID,
      key: 'RY-2',
      title: 'Triage the outage',
      loggedSeconds: 1800,
      estimateValue: null,
      completed: false,
    },
  ],
  completedItems: [
    {
      workItemId: '0193b3a0-0000-7000-8000-000000000020',
      projectId: SEED_PROJECT_ID,
      key: 'RY-1',
      title: 'Ship the report',
      completedAt: '2026-06-10T12:00:00.000Z',
    },
  ],
};

const mockWeekly = {
  getWeek: vi.fn(async (q: ReportWeekQuery): Promise<WeeklySummary> => {
    const v = validateWeekStart(q.weekStart);
    if (!v.ok) throw new BadRequestException(v.message);
    return weekly;
  }),
};

describe('TimeReportsController (contract)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ReportOverviewProvider)
      .useValue(mockOverview)
      .overrideProvider(InterruptionLedgerProvider)
      .useValue(mockLedger)
      .overrideProvider(WeeklySummaryProvider)
      .useValue(mockWeekly)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const authed = (path: string, scopes?: string[]): request.Test =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .set(
        'authorization',
        withPrincipal({
          userId: SEED_USER_ID,
          organizationId: SEED_ORG_ID,
          workspaceId: SEED_WORKSPACE_ID,
          role: 'OWNER',
          scopes,
        }),
      );

  // ─────────────────────────────────────────────────────── GET /time/reports/overview (US1)

  it('GET /time/reports/overview → 200 { data: ReportOverview }', async () => {
    const res = await authed('/time/reports/overview?from=2026-06-01&to=2026-06-14').send();
    expect(res.status).toBe(200);
    const data = res.body.data as ReportOverview;
    expect(data.totals).toMatchObject({ loggedSeconds: 13200 });
    // planned + interruption === logged at the headline AND every week row (SC-002).
    expect(data.totals.plannedSeconds + data.totals.interruptionSeconds).toBe(
      data.totals.loggedSeconds,
    );
    expect(
      data.weeks.every((w) => w.plannedSeconds + w.interruptionSeconds === w.loggedSeconds),
    ).toBe(true);
    // weeks ascending by Monday; topItems descending by loggedSeconds, ≤ 10.
    expect(data.weeks.map((w) => w.weekStart)).toEqual(['2026-06-01', '2026-06-08']);
    expect(data.topItems.length).toBeLessThanOrEqual(10);
    expect(data.topItems[0]?.loggedSeconds).toBeGreaterThanOrEqual(
      data.topItems[1]?.loggedSeconds ?? 0,
    );
  });

  it('GET /time/reports/overview without from/to → 400 (required)', async () => {
    expect((await authed('/time/reports/overview?from=2026-06-01').send()).status).toBe(400);
    expect((await authed('/time/reports/overview?to=2026-06-14').send()).status).toBe(400);
  });

  it('GET /time/reports/overview with a non-date param → 400 (regex)', async () => {
    const res = await authed('/time/reports/overview?from=06/01/2026&to=2026-06-14').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/overview with an unknown query field → 400 (strict)', async () => {
    const res = await authed('/time/reports/overview?from=2026-06-01&to=2026-06-14&bogus=1').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/overview with from > to → 400 (range policy)', async () => {
    const res = await authed('/time/reports/overview?from=2026-06-14&to=2026-06-01').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/overview with a span > 366 days → 400 (range policy)', async () => {
    const res = await authed('/time/reports/overview?from=2026-01-01&to=2027-06-01').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/overview with no principal → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/time/reports/overview?from=2026-06-01&to=2026-06-14')
      .send();
    expect(res.status).toBe(401);
  });

  it('GET /time/reports/overview with a projectId the caller cannot view → 403', async () => {
    const res = await authed(
      `/time/reports/overview?from=2026-06-01&to=2026-06-14&projectId=${FORBIDDEN_PROJECT}`,
    ).send();
    expect(res.status).toBe(403);
  });

  it('GET /time/reports/overview without work:read (scope ∩ role) → 403', async () => {
    const res = await authed('/time/reports/overview?from=2026-06-01&to=2026-06-14', [
      'org:read',
    ]).send();
    expect(res.status).toBe(403);
  });

  it('GET /time/reports/overview with a non-uuid projectId → 400', async () => {
    const res = await authed(
      '/time/reports/overview?from=2026-06-01&to=2026-06-14&projectId=not-a-uuid',
    ).send();
    expect(res.status).toBe(400);
  });

  // ─────────────────────────────────────────────── GET /time/reports/interruptions (US2)

  it('GET /time/reports/interruptions → 200 { data: InterruptionLedger } that reconciles', async () => {
    const res = await authed('/time/reports/interruptions?from=2026-06-01&to=2026-06-14').send();
    expect(res.status).toBe(200);
    const data = res.body.data as InterruptionLedger;
    // Σ items.seconds === Σ weeks.seconds === totalSeconds (SC-003).
    expect(data.items.reduce((s, i) => s + i.seconds, 0)).toBe(data.totalSeconds);
    expect(data.weeks.reduce((s, w) => s + w.seconds, 0)).toBe(data.totalSeconds);
    // items ordered seconds DESC; captureSource is the item's M3 provenance; reporter null = removed.
    expect(data.items[0]?.seconds).toBeGreaterThanOrEqual(data.items[1]?.seconds ?? 0);
    expect(data.items[0]?.captureSource).toBe('SLACK');
    expect(data.items[1]?.reporter).toBeNull();
  });

  it('GET /time/reports/interruptions without from/to → 400', async () => {
    expect((await authed('/time/reports/interruptions?from=2026-06-01').send()).status).toBe(400);
  });

  it('GET /time/reports/interruptions with from > to → 400 (range policy)', async () => {
    const res = await authed('/time/reports/interruptions?from=2026-06-14&to=2026-06-01').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/interruptions with no principal → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/time/reports/interruptions?from=2026-06-01&to=2026-06-14')
      .send();
    expect(res.status).toBe(401);
  });

  it('GET /time/reports/interruptions with a projectId the caller cannot view → 403', async () => {
    const res = await authed(
      `/time/reports/interruptions?from=2026-06-01&to=2026-06-14&projectId=${FORBIDDEN_PROJECT}`,
    ).send();
    expect(res.status).toBe(403);
  });

  // ───────────────────────────────────────────────────── GET /time/reports/week (US3)

  it('GET /time/reports/week → 200 { data: WeeklySummary } with raw estimate + completed list', async () => {
    const res = await authed('/time/reports/week?weekStart=2026-06-08').send();
    expect(res.status).toBe(200);
    const data = res.body.data as WeeklySummary;
    expect(data.weekStart).toBe('2026-06-08');
    expect(data.weekEnd).toBe('2026-06-14'); // weekStart + 6
    expect(data.totals.plannedSeconds + data.totals.interruptionSeconds).toBe(
      data.totals.loggedSeconds,
    );
    // items carry the raw M1 numeric-as-string estimate (or null), descending by loggedSeconds.
    expect(data.items[0]?.estimateValue).toBe('8');
    expect(data.items[1]?.estimateValue).toBeNull();
    expect(data.items[0]?.loggedSeconds).toBeGreaterThanOrEqual(data.items[1]?.loggedSeconds ?? 0);
    expect(data.completedItems[0]).toMatchObject({ key: 'RY-1' });
  });

  it('GET /time/reports/week with a non-Monday weekStart → 400 (plain-language)', async () => {
    const res = await authed('/time/reports/week?weekStart=2026-06-09').send(); // a Tuesday
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/week without weekStart → 400 (required)', async () => {
    expect((await authed('/time/reports/week').send()).status).toBe(400);
  });

  it('GET /time/reports/week with an unknown query field → 400 (strict)', async () => {
    const res = await authed('/time/reports/week?weekStart=2026-06-08&bogus=1').send();
    expect(res.status).toBe(400);
  });

  it('GET /time/reports/week with no principal → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/time/reports/week?weekStart=2026-06-08')
      .send();
    expect(res.status).toBe(401);
  });
});
