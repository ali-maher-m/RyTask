import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@rytask/contracts';
import { SEED_ORG_ID, SEED_USER_ID, SEED_WORKSPACE_ID } from '@rytask/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module';
import { WhoamiProvider } from '../../modules/identity/providers/whoami.provider';
import { InviteProvider } from '../../modules/orgs/providers/invite.provider';
import { OrgsService } from '../../modules/orgs/services/orgs.service';
import { WorkItemsService } from '../../modules/work-items/services/work-items.service';
import { withPrincipal } from './with-principal';

/**
 * Authorization-matrix test (T072, US4, FR-RBAC-001/002/007, SC-005/006/007). Drives a
 * representative route per permission **directly against the API** as each built-in role
 * (real `withPrincipal()` tokens) and asserts the live RbacGuard's decision matches every
 * row of `rbac-matrix.md` across M0 **and** retrofitted M1 surfaces: default-deny, Viewer
 * read-only (mutation → 403), and the role-gated member actions. Service providers are
 * mocked, so a non-403 status proves RBAC opened the gate; a 403 proves it closed it.
 */
const ROLES: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER'];

const tok = (role: Role): string =>
  withPrincipal({
    userId: SEED_USER_ID,
    organizationId: SEED_ORG_ID,
    workspaceId: SEED_WORKSPACE_ID,
    role,
  });

interface Case {
  name: string;
  allowed: Role[];
  run: (server: unknown, role: Role) => request.Test;
}

const cases: Case[] = [
  {
    name: 'GET /auth/whoami — self',
    allowed: ROLES,
    run: (s, role) =>
      request(s as never)
        .get('/api/v1/auth/whoami')
        .set('authorization', tok(role)),
  },
  {
    name: 'GET /orgs/current — org:read',
    allowed: ROLES,
    run: (s, role) =>
      request(s as never)
        .get('/api/v1/orgs/current')
        .set('authorization', tok(role)),
  },
  {
    name: 'GET /work-items — work:read (M1 retrofit)',
    allowed: ROLES,
    run: (s, role) =>
      request(s as never)
        .get('/api/v1/work-items')
        .set('authorization', tok(role)),
  },
  {
    name: 'POST /work-items — work:write (Viewer/Guest read-only, SC-006)',
    allowed: ['OWNER', 'ADMIN', 'MEMBER'],
    run: (s, role) =>
      request(s as never)
        .post('/api/v1/work-items')
        .set('authorization', tok(role))
        .send({ title: 'Matrix item' }),
  },
  {
    name: 'GET /invites — members:read (Guest denied)',
    allowed: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'],
    run: (s, role) =>
      request(s as never)
        .get('/api/v1/invites')
        .set('authorization', tok(role)),
  },
  {
    name: 'POST /invites — members:invite (Admin+ only, SC-007)',
    allowed: ['OWNER', 'ADMIN'],
    run: (s, role) =>
      request(s as never)
        .post('/api/v1/invites')
        .set('authorization', tok(role))
        .send({ role: 'MEMBER' }),
  },
];

describe('authorization matrix (RBAC, M0 + M1)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WhoamiProvider)
      .useValue({ build: vi.fn(async () => ({ role: 'OWNER' })) })
      .overrideProvider(OrgsService)
      .useValue({
        current: vi.fn(async () => ({ id: SEED_ORG_ID, name: 'Acme', slug: 'acme', settings: {} })),
      })
      .overrideProvider(WorkItemsService)
      .useValue({
        list: vi.fn(async () => ({ data: [], nextCursor: null })),
        create: vi.fn(async () => ({ data: { id: 'wi-1' } })),
      })
      .overrideProvider(InviteProvider)
      .useValue({
        list: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: 'inv-1', acceptUrl: 'http://localhost:3000/invite/x' })),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['healthz', 'readyz'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses every protected route without a token (default-deny, SC-005)', async () => {
    for (const c of cases) {
      // Re-run without auth: AuthGuard 401s before RBAC.
      const res = await c.run(app.getHttpServer(), 'OWNER').set('authorization', '');
      expect(res.status).toBe(401);
    }
  });

  for (const c of cases) {
    describe(c.name, () => {
      for (const role of ROLES) {
        const allow = c.allowed.includes(role);
        it(`${role} → ${allow ? 'allowed' : '403'}`, async () => {
          const res = await c.run(app.getHttpServer(), role);
          if (allow) {
            expect(res.status).not.toBe(403);
          } else {
            expect(res.status).toBe(403);
          }
        });
      }
    });
  }
});
