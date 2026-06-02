import { Inject, Injectable } from '@nestjs/common';
import {
  type Database,
  type OrgSettings,
  type Organization,
  type User,
  type Workspace,
  memberships,
  organizations,
  projectCounters,
  projectMembers,
  projects,
  statuses,
  users,
  workspaces,
} from '@rytask/db';
import { sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import { TenantContextService } from '../../../common/tenancy/tenant-context.service';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository';

/**
 * The six categorized statuses every new project seeds with (FR-WF-001). Mirrors
 * `projects/repositories/seed-default-statuses.ts` and the DB seed (kept inline here to
 * avoid a cross-module import — module boundaries forbid orgs→projects internals).
 */
const STARTER_STATUSES = [
  { name: 'Backlog', category: 'BACKLOG' as const, color: '#6B7280', position: 0 },
  { name: 'To Do', category: 'UNSTARTED' as const, color: '#9CA3AF', position: 1 },
  { name: 'In Progress', category: 'STARTED' as const, color: '#3B82F6', position: 2 },
  { name: 'Review', category: 'STARTED' as const, color: '#A855F7', position: 3 },
  { name: 'Done', category: 'COMPLETED' as const, color: '#22C55E', position: 4 },
  { name: 'Cancelled', category: 'CANCELLED' as const, color: '#EF4444', position: 5 },
];

export interface BootstrapInput {
  organizationName: string;
  orgSlug: string;
  settings: OrgSettings;
  ownerName: string;
  ownerEmail: string;
  ownerPasswordHash: string;
  starterProjectName: string;
  starterKeyPrefix: string;
  now: Date;
}

export interface BootstrapResult {
  org: Organization;
  workspace: Workspace;
  user: User;
  projectId: string;
}

/** Thrown when a concurrent first-run won the race; the provider maps it to 409. */
export class AlreadyBootstrappedError extends Error {
  constructor() {
    super('already bootstrapped');
    this.name = 'AlreadyBootstrappedError';
  }
}

/** Fixed advisory-lock key serializing concurrent first-run attempts (one instance = one org). */
const BOOTSTRAP_LOCK_KEY = 991_001;

/**
 * First-run provisioning repository (research D7). Creates the entire initial tenant —
 * organization, default workspace, owner user (+ OWNER membership), and a starter project
 * with its counter, six categorized statuses, and the owner's ADMIN project membership — in
 * **one transaction** so first-run is all-or-nothing (US1 AC). This is the deliberate
 * cross-context exception: a one-time bootstrap legitimately spans identity/orgs/projects
 * tables in a single tx; ordinary code goes through module contracts (Principle III).
 */
@Injectable()
export class BootstrapRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Database, tenant: TenantContextService) {
    super(db, tenant);
  }

  /** Global org count for the first-run gate (no tenant context exists yet). */
  async countOrgs(): Promise<number> {
    const [row] = await this.db.select({ count: sql<string>`count(*)` }).from(organizations);
    return Number(row?.count ?? 0);
  }

  async bootstrap(input: BootstrapInput): Promise<BootstrapResult> {
    return this.db.transaction(async (tx): Promise<BootstrapResult> => {
      // Serialize concurrent first-run attempts (the outer isAvailable() is only a fast-path) and
      // re-check the single-org invariant INSIDE the tx + lock, so two simultaneous POST /setup
      // requests can't both create an organization. The xact lock releases at commit/rollback.
      await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
      const [existing] = await tx.select({ count: sql<string>`count(*)` }).from(organizations);
      if (Number(existing?.count ?? 0) > 0) {
        throw new AlreadyBootstrappedError();
      }

      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug: input.orgSlug, settings: input.settings })
        .returning();
      if (!org) {
        throw new Error('failed to create organization');
      }

      const [workspace] = await tx
        .insert(workspaces)
        .values({ organizationId: org.id, name: 'Default', slug: 'default' })
        .returning();
      if (!workspace) {
        throw new Error('failed to create workspace');
      }

      const [user] = await tx
        .insert(users)
        .values({
          organizationId: org.id,
          email: input.ownerEmail,
          name: input.ownerName,
          passwordHash: input.ownerPasswordHash,
          emailVerifiedAt: input.now,
        })
        .returning();
      if (!user) {
        throw new Error('failed to create owner user');
      }

      await tx
        .insert(memberships)
        .values({ organizationId: org.id, userId: user.id, role: 'OWNER' });

      const [project] = await tx
        .insert(projects)
        .values({
          organizationId: org.id,
          workspaceId: workspace.id,
          name: input.starterProjectName,
          keyPrefix: input.starterKeyPrefix,
          leadId: user.id,
        })
        .returning();
      if (!project) {
        throw new Error('failed to create starter project');
      }

      await tx
        .insert(projectCounters)
        .values({ projectId: project.id, organizationId: org.id, lastNumber: 0 });

      await tx.insert(statuses).values(
        STARTER_STATUSES.map((s) => ({
          organizationId: org.id,
          projectId: project.id,
          name: s.name,
          category: s.category,
          color: s.color,
          position: s.position,
        })),
      );

      await tx
        .insert(projectMembers)
        .values({ organizationId: org.id, projectId: project.id, userId: user.id, role: 'ADMIN' });

      return { org, workspace, user, projectId: project.id };
    });
  }
}
